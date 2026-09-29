import {
    _decorator,
    Component,
    Node,
    Prefab,
    Camera,
    Canvas,
    UITransform,
    Layers,
    instantiate,
    view
} from 'cc';

import {
    TowerSlot
} from './BoardSlot';

import {
    HexPiece,
    HexColor
} from './HexPiece';

import {
    TowerLevel,
    RingGeometry
} from './TowerLevel';

import {
    TowerInput,
    TowerInputHost
} from './TowerInput';

import {
    DropColumn
} from './DropColumn';

import {
    CTAController
} from '../ui/CTAController';


const { ccclass, property } = _decorator;


enum GameState {
    Playing,
    Resolving,
    Complete
}


// Column 0 (Slots_00 on every level) is the one fixed, always-empty ring
// position the collection column reaches — every other column gets a
// randomly colored hex.
const DROP_COLUMN_INDEX = 0;
const COLUMN_COUNT = 14;

// Two guaranteed target-colored hexes per level — one for each of the two
// required clears — both within 1-2 steps of column 0 (the ring is now a
// regular 14-gon, so "column k" is exactly k steps from the reference) so
// every round stays quick even though the rest of the tower is random.
// Level0's first column is the tutorial's demonstrated move.
const GUARANTEED_COLUMNS_BY_LEVEL: number[][] = [
    [1, 13],
    [2, 12],
    [1, 13],
    [2, 12],
    [1, 13],
    [2, 12]
];

const TUTORIAL_LEVEL_INDEX = 0;
const TUTORIAL_TARGET_COLUMN = GUARANTEED_COLUMNS_BY_LEVEL[TUTORIAL_LEVEL_INDEX][0];

const CLEARS_TO_COMPLETE = 2;


@ccclass('GameManager')
export class GameManager extends Component implements TowerInputHost {

    // --------------------------------------------------
    // References (wired in the scene)
    // --------------------------------------------------

    @property(Node)
    public slotsParent: Node | null = null;

    @property(Prefab)
    public hexPrefab: Prefab | null = null;

    @property(Camera)
    public mainCamera: Camera | null = null;


    private levels: TowerLevel[] = [];

    private dropColumn: DropColumn | null = null;
    private towerInput: TowerInput | null = null;
    private ctaController: CTAController | null = null;

    private state: GameState = GameState.Playing;
    private clearsCompleted = 0;


    start() {

        if (!this.slotsParent) {
            console.error('GameManager: Slots Parent is not assigned!');
            return;
        }

        if (!this.hexPrefab) {
            console.error('GameManager: Hex Prefab is not assigned!');
            return;
        }

        if (!this.mainCamera) {
            console.error('GameManager: Main Camera is not assigned!');
            return;
        }

        const built = this.buildLevels(this.slotsParent);

        this.levels = built.levels;
        this.populateTower(this.randomColor());

        this.dropColumn = this.buildDropColumn();

        const ui = this.buildUISystem();

        this.ctaController = this.node.addComponent(CTAController);
        this.ctaController.init(ui.canvasNode, ui.width, ui.height);

        const towerCenter = this.slotsParent.worldPosition;

        this.towerInput = this.node.addComponent(TowerInput);
        this.towerInput.init(
            this.mainCamera, ui.uiCamera, ui.canvasNode,
            this.levels, built.averageRadius, towerCenter.x, towerCenter.z,
            this
        );

        const tutorialLevel = this.levels[TUTORIAL_LEVEL_INDEX];

        if (tutorialLevel) {
            this.towerInput.showTutorial(tutorialLevel, TUTORIAL_TARGET_COLUMN);
        }

    }


    // --------------------------------------------------
    // TowerInputHost
    // --------------------------------------------------

    // A level can be picked up only while nothing else is resolving, and
    // only while its height isn't "blocked" by a settled drop-column piece —
    // the column fills from the bottom, so the bottom `fillCount` levels
    // (by levelIndex) are locked until that run either grows past them or
    // clears entirely.
    public canRotateLevel(level: TowerLevel): boolean {

        if (this.state !== GameState.Playing)
            return false;

        const fillCount = this.dropColumn?.getFillCount() ?? 0;

        return level.levelIndex >= fillCount;

    }


    public onLevelRotated(level: TowerLevel, _alignedColumn: number): void {

        if (this.state === GameState.Complete)
            return;

        const slot = level.getAlignedSlot();

        if (!slot || slot.isEmpty())
            return;

        const piece = slot.getHex();

        if (!piece || !this.dropColumn)
            return;

        if (!this.dropColumn.canAccept(piece.getColor()))
            return;

        slot.removeHex();

        this.state = GameState.Resolving;

        this.dropColumn.dropHex(piece).then(() => {

            if (this.state !== GameState.Complete) {
                this.state = GameState.Playing;
            }

        });

    }


    private onColumnCleared(_color: HexColor) {

        this.clearsCompleted++;

        if (this.clearsCompleted >= CLEARS_TO_COMPLETE) {
            this.completeGame();
        }

    }


    private completeGame() {

        this.state = GameState.Complete;
        this.towerInput?.hideTutorial();
        this.ctaController?.show();

    }


    // --------------------------------------------------
    // Tower construction
    // --------------------------------------------------

    // Groups the 60 pre-placed TowerSlot cells into 6 rotating TowerLevels,
    // and derives the ring's real angular layout once from Level0 (every
    // level shares the same 10-position layout, just at a different height).
    private buildLevels(slotsParent: Node): { levels: TowerLevel[]; averageRadius: number } {

        const raw: { levelIndex: number; node: Node; slotsByColumn: Map<number, TowerSlot> }[] = [];

        let geometry: RingGeometry | null = null;
        let averageRadius = 0.27;

        for (const levelNode of slotsParent.children) {

            const levelMatch = /(\d+)$/.exec(levelNode.name);

            if (!levelMatch)
                continue;

            const levelIndex = parseInt(levelMatch[1], 10);
            const slotsByColumn = new Map<number, TowerSlot>();

            for (const slotNode of levelNode.children) {

                const slot = slotNode.getComponent(TowerSlot);

                if (!slot)
                    continue;

                const columnMatch = /(\d+)$/.exec(slotNode.name);

                if (!columnMatch)
                    continue;

                const columnIndex = parseInt(columnMatch[1], 10);

                slot.columnIndex = columnIndex;
                slot.levelIndex = levelIndex;

                slotsByColumn.set(columnIndex, slot);

            }

            raw.push({ levelIndex, node: levelNode, slotsByColumn });

            if (levelIndex === 0) {
                const computed = this.computeRingGeometry(levelNode);
                geometry = computed.geometry;
                averageRadius = computed.averageRadius;
            }

        }

        if (!geometry) {
            console.error('GameManager: could not find Level0 to derive ring geometry');
            geometry = { order: [], angleOf: [] };
        }

        const levels: TowerLevel[] = [];

        for (const entry of raw) {
            levels[entry.levelIndex] = new TowerLevel(entry.levelIndex, entry.node, geometry, entry.slotsByColumn);
        }

        return { levels, averageRadius };

    }


    // The 10 ring positions aren't evenly spaced (it's closer to a flower
    // than a regular decagon), so real angles are read from the live scene
    // rather than assumed. order[0] is pinned to column 0 as a fixed,
    // arbitrary reference angle — every level starts aligned there.
    private computeRingGeometry(level0: Node): { geometry: RingGeometry; averageRadius: number } {

        const entries: { column: number; angle: number; radius: number }[] = [];

        for (const slotNode of level0.children) {

            const match = /(\d+)$/.exec(slotNode.name);

            if (!match)
                continue;

            const column = parseInt(match[1], 10);
            const x = slotNode.position.x;
            const z = slotNode.position.z;

            entries.push({
                column,
                angle: Math.atan2(z, x) * 180 / Math.PI,
                radius: Math.hypot(x, z)
            });

        }

        entries.sort((a, b) => a.angle - b.angle);

        const zeroIndex = entries.findIndex(e => e.column === 0);
        const rotated = zeroIndex > 0
            ? [...entries.slice(zeroIndex), ...entries.slice(0, zeroIndex)]
            : entries;

        const averageRadius = rotated.reduce((sum, e) => sum + e.radius, 0) / rotated.length;

        return {
            geometry: {
                order: rotated.map(e => e.column),
                angleOf: rotated.map(e => e.angle)
            },
            averageRadius
        };

    }


    // Fills every column except the fixed drop column (0) on every level
    // with a hex piece. Two columns per level are guaranteed to hold the
    // session's target color at an easy-to-reach angle — enough for both
    // required clears — so the puzzle stays reliably solvable; everywhere
    // else gets a genuinely random color for visual variety — extra matches
    // of the target color (or full runs of some other color) can turn up
    // there too, which only helps the player.
    private populateTower(targetColor: HexColor) {

        for (let levelIndex = 0; levelIndex < this.levels.length; levelIndex++) {

            const level = this.levels[levelIndex];

            if (!level)
                continue;

            const guaranteedColumns = new Set(GUARANTEED_COLUMNS_BY_LEVEL[levelIndex]);

            for (let column = 0; column < COLUMN_COUNT; column++) {

                if (column === DROP_COLUMN_INDEX)
                    continue;

                const slot = level.getSlotAt(column);

                if (!slot)
                    continue;

                const color = guaranteedColumns.has(column) ? targetColor : this.randomColor();

                this.spawnPieceAt(slot, color);

            }

        }

    }


    private spawnPieceAt(slot: TowerSlot, color: HexColor) {

        const node = instantiate(this.hexPrefab!);
        const piece = node.getComponent(HexPiece);

        if (!piece) {
            console.error('GameManager: hexPrefab has no HexPiece component');
            node.destroy();
            return;
        }

        piece.node.setParent(slot.node);
        piece.node.setPosition(0, 0, 0);

        slot.setHex(piece);
        piece.setColor(color);

    }


    private randomColor(): HexColor {

        const colorCount = 7; // HexColor.Red .. HexColor.Pink

        return Math.floor(Math.random() * colorCount) as HexColor;

    }


    // Builds the fixed collection column: 6 stacked anchors, one per level
    // height, all at column 0's original (X, Z) — the same ring position
    // every level starts with empty — so it reads as one continuous open
    // channel running through the tower, independent of any level's
    // rotation.
    private buildDropColumn(): DropColumn {

        const referenceSlot = this.levels[0]?.getSlotAt(DROP_COLUMN_INDEX);

        if (!referenceSlot) {
            console.error('GameManager: could not find the drop column reference slot');
        }

        const referenceXZ = referenceSlot ? referenceSlot.node.worldPosition : this.slotsParent!.worldPosition;

        const columnNode = new Node('DropColumn');
        this.node.addChild(columnNode);
        columnNode.setWorldPosition(referenceXZ.x, 0, referenceXZ.z);

        const anchors: Node[] = [];
        const levelYs = this.levels.map(level => level.worldY).sort((a, b) => a - b);

        for (const y of levelYs) {

            const anchor = new Node('DropAnchor');
            columnNode.addChild(anchor);
            anchor.setPosition(0, y, 0);

            anchors.push(anchor);

        }

        const dropColumn = columnNode.addComponent(DropColumn);
        dropColumn.init(anchors, (color) => this.onColumnCleared(color));

        return dropColumn;

    }


    // --------------------------------------------------
    // Minimal runtime UI system (no Canvas exists in the scene yet)
    // --------------------------------------------------

    private buildUISystem(): { canvasNode: Node; uiCamera: Camera; width: number; height: number } {

        const size = view.getVisibleSize();

        const cameraNode = new Node('UICamera');
        this.node.addChild(cameraNode);
        cameraNode.layer = Layers.Enum.UI_2D;
        cameraNode.setPosition(0, 0, 1000);

        const uiCamera = cameraNode.addComponent(Camera);
        uiCamera.projection = Camera.ProjectionType.ORTHO;
        uiCamera.orthoHeight = size.height / 2;
        uiCamera.near = 1;
        uiCamera.far = 2000;
        uiCamera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        uiCamera.visibility = Layers.Enum.UI_2D;
        uiCamera.priority = 10;

        const canvasNode = new Node('Canvas');
        this.node.addChild(canvasNode);
        canvasNode.layer = Layers.Enum.UI_2D;
        canvasNode.addComponent(UITransform).setContentSize(size.width, size.height);

        const canvas = canvasNode.addComponent(Canvas);
        canvas.cameraComponent = uiCamera;

        return { canvasNode, uiCamera, width: size.width, height: size.height };

    }

}
