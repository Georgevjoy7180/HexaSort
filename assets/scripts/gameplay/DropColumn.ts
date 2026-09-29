import {
    _decorator,
    Component,
    Node,
    Vec3,
    tween
} from 'cc';

import {
    HexPiece,
    HexColor
} from './HexPiece';


const { ccclass } = _decorator;

const REQUIRED_MATCH = 6;
const FALL_DURATION = 0.22;
const CLEAR_STAGGER = 0.03;
const CLEAR_PULSE_DURATION = 0.12;
const CLEAR_POP_DURATION = 0.16;


/**
 * The fixed central collection column running through the tower's core.
 * Logical state (the `pieces` array) is kept separate from the visuals:
 * pieces are just reparented HexPiece nodes, never duplicated.
 */
@ccclass('DropColumn')
export class DropColumn extends Component {

    private anchors: Node[] = [];
    private pieces: HexPiece[] = [];
    private onCleared: ((color: HexColor) => void) | null = null;


    public init(anchors: Node[], onCleared: (color: HexColor) => void) {

        this.anchors = anchors;
        this.onCleared = onCleared;

    }


    // How many anchors (counting from the bottom) currently hold a piece —
    // GameManager uses this to lock the corresponding levels from rotating
    // while their height is "blocked" by a settled piece.
    public getFillCount(): number {

        return this.pieces.length;

    }


    public canAccept(color: HexColor): boolean {

        if (this.pieces.length >= this.anchors.length)
            return false;

        if (this.pieces.length === 0)
            return true;

        return this.pieces[0].getColor() === color;

    }


    public dropHex(hex: HexPiece): Promise<void> {

        return new Promise((resolve) => {

            const anchor = this.anchors[this.pieces.length];

            if (!anchor) {
                resolve();
                return;
            }

            this.pieces.push(hex);

            // this.node (the drop column root) sits at the tower's centre,
            // not at world-origin identity, so falling pieces are tweened
            // in its LOCAL space — the same space anchor.position is in —
            // rather than raw world coordinates.
            hex.node.setParent(this.node, true);

            const destLocal = anchor.position.clone();

            tween(hex.node)
                .to(FALL_DURATION, { position: destLocal }, { easing: 'quadIn' })
                .call(() => {

                    hex.node.setParent(anchor);
                    hex.node.setPosition(0, 0, 0);

                    // The prefab's resting scale isn't 1 (it's baked small
                    // to match the board), so the punch is relative to it
                    // rather than an absolute target.
                    const baseScale = hex.node.scale.clone();

                    tween(hex.node)
                        .to(0.05, {
                            scale: new Vec3(baseScale.x * 1.15, baseScale.y * 0.82, baseScale.z * 1.15)
                        }, { easing: 'quadOut' })
                        .to(0.08, { scale: baseScale }, { easing: 'backOut' })
                        .start();

                    this.checkMatch();
                    resolve();

                })
                .start();

        });

    }


    public checkMatch(): void {

        if (this.pieces.length >= REQUIRED_MATCH) {
            this.clearColumn();
        }

    }


    public clearColumn(): void {

        const color = this.pieces[0]?.getColor();
        const pieces = this.pieces.slice();

        // Levels stay locked (this.pieces stays "full") until every piece
        // has actually finished popping away, not just from the moment the
        // match was detected.
        let destroyedCount = 0;

        pieces.forEach((piece, index) => {

            const baseScale = piece.node.scale.clone();

            tween(piece.node)
                .delay(index * CLEAR_STAGGER)
                .to(CLEAR_PULSE_DURATION, {
                    scale: new Vec3(baseScale.x * 1.35, baseScale.y * 1.35, baseScale.z * 1.35)
                }, { easing: 'quadOut' })
                .to(CLEAR_POP_DURATION, { scale: new Vec3(0, 0, 0) }, { easing: 'backIn' })
                .call(() => {

                    piece.node.destroy();
                    destroyedCount++;

                    if (destroyedCount === pieces.length) {

                        this.pieces.length = 0;

                        if (color !== undefined) {
                            this.onCleared?.(color);
                        }

                    }

                })
                .start();

        });

    }

}
