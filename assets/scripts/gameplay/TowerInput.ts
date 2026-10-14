import {
    _decorator,
    Component,
    Node,
    Camera,
    input,
    Input,
    EventTouch,
    EventMouse,
    Vec2,
    Vec3,
    tween,
    Tween,
    Graphics,
    UITransform,
    Color,
    Layers,
    view
} from 'cc';

import {
    TowerLevel
} from './TowerLevel';


const { ccclass } = _decorator;

const HAND_SWIPE_DISTANCE_UI = 150;


export interface TowerInputHost {

    canRotateLevel(level: TowerLevel): boolean;
    onLevelRotated(level: TowerLevel, alignedColumn: number): void;

}


@ccclass('TowerInput')
export class TowerInput extends Component {

    private camera: Camera | null = null;
    private uiCamera: Camera | null = null;
    private uiRoot: Node | null = null;
    private levels: TowerLevel[] = [];
    private host: TowerInputHost | null = null;

    private towerRadius = 0.27;
    private towerCenterX = 0;
    private towerCenterZ = 0;
    private degreesPerPixel = 0.3;

    private activeLevel: TowerLevel | null = null;
    private startScreenX = 0;

    private tutorialHand: Node | null = null;
    private tutorialActive = false;
    private tutorialLevel: TowerLevel | null = null;
    private tutorialTargetColumn = 0;


    public init(
        camera: Camera,
        uiCamera: Camera,
        uiRoot: Node,
        levels: TowerLevel[],
        towerRadius: number,
        towerCenterX: number,
        towerCenterZ: number,
        host: TowerInputHost
    ) {

        this.camera = camera;
        this.uiCamera = uiCamera;
        this.uiRoot = uiRoot;
        this.levels = levels;
        this.towerRadius = towerRadius;
        this.towerCenterX = towerCenterX;
        this.towerCenterZ = towerCenterZ;
        this.host = host;

        // A half-screen-width drag rotates the tower by ~225 degrees — ensuring
        // the player can comfortably reach any position on the 360-degree cylinder
        // (max 180 degrees in either direction) in a single natural swipe.
        const visibleWidth = view.getVisibleSize().width;
        this.degreesPerPixel = 225 / (visibleWidth * 0.5);

        input.on(Input.EventType.TOUCH_START, this.onDown, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this.onUp, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onUp, this);

        input.on(Input.EventType.MOUSE_DOWN, this.onDown, this);
        input.on(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.on(Input.EventType.MOUSE_UP, this.onUp, this);

    }


    onDestroy() {

        input.off(Input.EventType.TOUCH_START, this.onDown, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this.onUp, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onUp, this);

        input.off(Input.EventType.MOUSE_DOWN, this.onDown, this);
        input.off(Input.EventType.MOUSE_MOVE, this.onMouseMove, this);
        input.off(Input.EventType.MOUSE_UP, this.onUp, this);

    }


    // --------------------------------------------------
    // Pointer handling (touch + mouse share the same logic)
    // --------------------------------------------------

    private onDown(event: EventTouch | EventMouse) {

        if (!this.enabled)
            return;

        this.hideTutorial();

        if (this.activeLevel)
            return;

        const screenPos = event.getLocation(new Vec2());
        const touchedY = this.raycastTowerSurfaceY(screenPos);

        if (touchedY === null)
            return;

        let nearest: TowerLevel | null = null;
        let nearestDelta = Infinity;

        for (const level of this.levels) {

            const delta = Math.abs(level.worldY - touchedY);

            if (delta < nearestDelta) {
                nearestDelta = delta;
                nearest = level;
            }

        }

        // Checked only once the specific level is known — a level whose
        // height is currently "blocked" by a settled drop-column piece
        // can't be picked up, even while other levels still can.
        if (!nearest || !this.host?.canRotateLevel(nearest))
            return;

        this.activeLevel = nearest;
        this.startScreenX = screenPos.x;

    }


    private onTouchMove(event: EventTouch) {

        this.trackDrag(event.getLocation(new Vec2()));

    }


    private onMouseMove(event: EventMouse) {

        this.trackDrag(event.getLocation(new Vec2()));

    }


    private trackDrag(screenPos: Vec2) {

        if (!this.activeLevel)
            return;

        this.activeLevel.previewRotation(this.offsetDegrees(screenPos.x));

    }


    private onUp(event: EventTouch | EventMouse) {

        const level = this.activeLevel;

        if (!level)
            return;

        this.activeLevel = null;

        const screenPos = event.getLocation(new Vec2());
        const alignedColumn = level.releaseRotation(this.offsetDegrees(screenPos.x));

        this.host?.onLevelRotated(level, alignedColumn);

    }


    private offsetDegrees(currentScreenX: number): number {

        return (currentScreenX - this.startScreenX) * this.degreesPerPixel;

    }


    // --------------------------------------------------
    // "Which level did the player touch" — intersect the touch ray with an
    // infinite vertical cylinder around the tower's core, then pick the
    // level whose height is closest to where the ray grazes that surface.
    // --------------------------------------------------

    private raycastTowerSurfaceY(screenPos: Vec2): number | null {

        if (!this.camera)
            return null;

        const ray = this.camera.screenPointToRay(screenPos.x, screenPos.y);

        // Shift into tower-centered space — the ring's axis isn't at world
        // origin, it's wherever the Board prefab instance actually sits.
        const ox = ray.o.x - this.towerCenterX;
        const oz = ray.o.z - this.towerCenterZ;
        const dx = ray.d.x;
        const dz = ray.d.z;

        const a = dx * dx + dz * dz;

        if (a <= 0.000001)
            return null;

        const b = 2 * (ox * dx + oz * dz);
        const c = ox * ox + oz * oz - this.towerRadius * this.towerRadius;

        const discriminant = b * b - 4 * a * c;

        if (discriminant < 0)
            return null;

        const sqrtDisc = Math.sqrt(discriminant);
        const t1 = (-b - sqrtDisc) / (2 * a);
        const t2 = (-b + sqrtDisc) / (2 * a);

        const t = t1 > 0 ? t1 : (t2 > 0 ? t2 : null);

        if (t === null)
            return null;

        return ray.o.y + ray.d.y * t;

    }


    // --------------------------------------------------
    // Tutorial hand
    // --------------------------------------------------

    public showTutorial(level: TowerLevel, targetColumn: number) {

        this.tutorialActive = true;
        this.tutorialLevel = level;
        this.tutorialTargetColumn = targetColumn;

        this.buildHandIfNeeded();
        this.playTutorialLoop();

    }


    public hideTutorial() {

        if (!this.tutorialActive)
            return;

        this.tutorialActive = false;

        if (this.tutorialHand) {
            Tween.stopAllByTarget(this.tutorialHand);
            this.tutorialHand.active = false;
        }

    }


    private buildHandIfNeeded() {

        if (this.tutorialHand || !this.uiRoot)
            return;

        const hand = new Node('TutorialHand');

        hand.layer = Layers.Enum.UI_2D;
        hand.addComponent(UITransform).setContentSize(64, 64);

        const gfx = hand.addComponent(Graphics);

        gfx.fillColor = new Color(20, 20, 20, 110);
        gfx.circle(2, -4, 24);
        gfx.fill();

        gfx.fillColor = new Color(255, 255, 255, 235);
        gfx.circle(0, 0, 24);
        gfx.fill();

        gfx.strokeColor = new Color(40, 40, 40, 200);
        gfx.lineWidth = 3;
        gfx.circle(0, 0, 24);
        gfx.stroke();

        gfx.fillColor = new Color(255, 200, 90, 255);
        gfx.circle(0, 0, 8);
        gfx.fill();

        this.uiRoot.addChild(hand);
        hand.setSiblingIndex(9999);

        this.tutorialHand = hand;

    }


    private worldToUI(worldPos: Vec3): Vec3 {

        const out = new Vec3();

        // convertToUINode projects through whichever camera it's called on —
        // that has to be the 3D camera that actually views the tower, not
        // the flat orthographic UI camera (which was giving garbage
        // positions — the hand was landing right at the screen edge).
        this.camera!.convertToUINode(worldPos, this.uiRoot!, out);

        return out;

    }


    private playTutorialLoop() {

        if (!this.tutorialActive || !this.tutorialHand || !this.tutorialLevel)
            return;

        const anchorSlot = this.tutorialLevel.getAlignedSlot();

        if (!anchorSlot) {
            this.tutorialActive = false;
            return;
        }

        const startUI = this.worldToUI(anchorSlot.node.worldPosition);

        // The demonstrated swipe always needs a positive (rightward) drag
        // for the puzzle's tutorial move — direction here mirrors that.
        const direction = this.tutorialLevel.getSignedOffsetTo(this.tutorialTargetColumn) >= 0 ? 1 : -1;
        const endUI = new Vec3(startUI.x + HAND_SWIPE_DISTANCE_UI * direction, startUI.y, startUI.z);

        const hand = this.tutorialHand;

        hand.active = true;
        hand.setPosition(startUI);
        hand.setScale(0, 0, 1);

        Tween.stopAllByTarget(hand);

        tween(hand)
            .to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .delay(0.2)
            .to(0.45, { position: endUI }, { easing: 'quadInOut' })
            .delay(0.15)
            .to(0.18, { scale: new Vec3(0.7, 0.7, 1) }, { easing: 'quadIn' })
            .delay(0.4)
            .call(() => {
                if (this.tutorialActive)
                    this.playTutorialLoop();
            })
            .start();

    }

}
