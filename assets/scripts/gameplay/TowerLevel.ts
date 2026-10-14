import {
    Node,
    Vec3,
    tween
} from 'cc';

import {
    TowerSlot
} from './BoardSlot';


const SNAP_DURATION = 0.28;


export interface RingGeometry {
    // Column indices (0-9) in the order they actually sit going around the
    // ring, starting from whichever column defines the fixed reference
    // angle (order[0]).
    order: number[];
    // angleOf[k] is the original world-plane angle (degrees) of order[k],
    // measured once from the live scene — the ring isn't a perfect decagon,
    // so real angles are used instead of an assumed fixed step size.
    angleOf: number[];
}


function angularDistance(a: number, b: number): number {

    let delta = (a - b) % 360;

    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    return Math.abs(delta);

}


/**
 * One rotating tower tier. Rotating the level's own Node carries its 10
 * TowerSlot children (and whatever HexPiece sits in each) rigidly around
 * with it — no per-piece animation needed for the spin itself.
 *
 * Logical state is just `alignedIndex`: which position in the ring
 * currently coincides with the fixed reference angle (where the drop
 * column is). The actual Y-rotation applied to the node is derived from
 * that index plus the ring's real (non-uniform) angles.
 */
export class TowerLevel {

    public readonly levelIndex: number;
    public readonly node: Node;

    private readonly order: number[];
    private readonly angleOf: number[];
    private readonly slotsByColumn: Map<number, TowerSlot>;

    private alignedIndex = 0;


    constructor(
        levelIndex: number,
        node: Node,
        geometry: RingGeometry,
        slotsByColumn: Map<number, TowerSlot>
    ) {

        this.levelIndex = levelIndex;
        this.node = node;
        this.order = geometry.order;
        this.angleOf = geometry.angleOf;
        this.slotsByColumn = slotsByColumn;

        this.node.setRotationFromEuler(0, this.thetaFor(this.alignedIndex), 0);

    }


    public get worldY(): number {

        return this.node.worldPosition.y;

    }


    // The slot currently sitting at the fixed reference angle (the one the
    // drop column can reach).
    public getAlignedSlot(): TowerSlot | null {

        const column = this.order[this.alignedIndex];

        return this.slotsByColumn.get(column) ?? null;

    }


    // Used only for puzzle setup — placing a starting piece at a specific
    // physical column regardless of current rotation.
    public getSlotAt(column: number): TowerSlot | null {

        return this.slotsByColumn.get(column) ?? null;

    }


    // The shortest signed rotation (degrees) that would bring `column` into
    // alignment from the level's current position — used by the tutorial
    // hand to demonstrate the correct swipe.
    public getSignedOffsetTo(column: number): number {

        const k = this.order.indexOf(column);

        if (k < 0)
            return 0;

        let delta = this.thetaFor(k) - this.thetaFor(this.alignedIndex);

        delta = ((delta + 180) % 360 + 360) % 360 - 180;

        return delta;

    }


    // Live rotation feedback while the player is still dragging — no
    // snapping yet, just tracks the finger.
    public previewRotation(offsetDegrees: number) {

        const theta = this.thetaFor(this.alignedIndex) + offsetDegrees;

        this.node.setRotationFromEuler(0, theta, 0);

    }

    // Called on release: snaps to whichever ring position's real angle is
    // closest to the raw drag angle, tweens there, and updates the logical
    // aligned index. Returns the column index that ends up aligned.
    public releaseRotation(offsetDegrees: number): number {

        const rawTheta = this.thetaFor(this.alignedIndex) + offsetDegrees;

        let bestIndex = 0;
        let bestDelta = Infinity;

        for (let k = 0; k < this.order.length; k++) {

            const delta = angularDistance(rawTheta, this.thetaFor(k));

            if (delta < bestDelta) {
                bestDelta = delta;
                bestIndex = k;
            }

        }

        this.alignedIndex = bestIndex;

        const targetTheta = this.thetaFor(bestIndex);

        tween(this.node)
            .to(SNAP_DURATION, { eulerAngles: new Vec3(0, targetTheta, 0) }, { easing: 'backOut' })
            .start();

        return this.order[bestIndex];

    }


    // Animates the level back to aligning a specific column (e.g. column 0)
    // with an optional delay and callback upon completion.
    public revertToColumn(column: number, delaySeconds = 0, onComplete?: () => void): void {

        const k = this.order.indexOf(column);

        if (k < 0) {
            onComplete?.();
            return;
        }

        this.alignedIndex = k;
        const targetTheta = this.thetaFor(k);

        tween(this.node)
            .delay(delaySeconds)
            .to(SNAP_DURATION, { eulerAngles: new Vec3(0, targetTheta, 0) }, { easing: 'backOut' })
            .call(() => {
                onComplete?.();
            })
            .start();

    }


    // Cocos's Y-axis rotation moves a point from local angle φ to world
    // angle (φ - θ) (positive θ follows the right-hand rule around +Y —
    // verified directly against Quat.fromEuler/Vec3.transformQuat, not
    // assumed). So bringing slot k's original angle to the reference
    // (angleOf[0]) needs θ = angleOf[k] - angleOf[0], not the reverse —
    // getting this backwards was exactly why rotating "by one slot" could
    // align (and drop) a different piece than the one that visually landed
    // in the gap.
    private thetaFor(k: number): number {

        return this.angleOf[k] - this.angleOf[0];

    }

}
