import {
    _decorator,
    Component,
    Node
} from 'cc';

import {
    HexPiece
} from './HexPiece';


const { ccclass } = _decorator;


/**
 * One hex cell on a tower level: a single (columnIndex, levelIndex) position
 * that holds at most one HexPiece.
 *
 * This class is named TowerSlot in code, but the file stays BoardSlot.ts —
 * it's already attached (via its script asset's uuid) to all 60 pre-placed
 * cells in scene.scene. Renaming the file would generate a new uuid and
 * break every one of those references, so only the class name changes.
 */
@ccclass('TowerSlot')
export class TowerSlot extends Component {

    // Assigned at runtime by GameManager while scanning the "Slots" hierarchy.
    public columnIndex: number = -1;
    public levelIndex: number = -1;

    private currentHex: HexPiece | null = null;


    onLoad() {

        // The tower is now fully dressed with hex pieces on every column but
        // one — the old placeholder "Sphere" marker isn't used any more.
        const placeholder = this.node.children[0] ?? null;

        if (placeholder) {
            placeholder.active = false;
        }

    }


    public isEmpty(): boolean {

        return this.currentHex === null;

    }


    public setHex(hex: HexPiece) {

        this.currentHex = hex;

    }


    public getHex(): HexPiece | null {

        return this.currentHex;

    }


    public removeHex(): HexPiece | null {

        const hex = this.currentHex;

        this.currentHex = null;

        return hex;

    }

}
