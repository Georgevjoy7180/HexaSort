import { _decorator, Component, Enum, Material, MeshRenderer } from 'cc';
const { ccclass, property } = _decorator;

export enum HexColor {
    Red,
    Blue,
    Green,
    Yellow,
    Purple,
    Orange,
    Pink
}

// Correctly register the Enum with Cocos Creator
Enum(HexColor);

@ccclass('HexPiece')
export class HexPiece extends Component {
    
    // Explicitly expose the enum property to the editor inspector
    @property({ type: Enum(HexColor) })
    public color: HexColor = HexColor.Red;

    @property(Material)
    public redMaterial: Material | null = null;

    @property(Material)
    public blueMaterial: Material | null = null;

    @property(Material)
    public greenMaterial: Material | null = null;

    @property(Material)
    public yellowMaterial: Material | null = null;

    @property(Material)
    public purpleMaterial: Material | null = null;

    @property(Material)
    public orangeMaterial: Material | null = null;

    @property(Material)
    public pinkMaterial: Material | null = null;

    private meshRenderer: MeshRenderer | null = null;

    onLoad() {
        // Pass the class type itself, not a variable name
        this.meshRenderer = this.getComponentInChildren(MeshRenderer);
         if (!this.meshRenderer) {

            console.error(
                `MeshRenderer not found inside ${this.node.name}`
            );

            return;
        }

        console.log(
            "MeshRenderer found:",
            this.meshRenderer.node.name
        );
        
    }

    public setColor(color: HexColor) {
        this.color = color;
        this.updateMaterial();
    }

    private updateMaterial() {
        if (!this.meshRenderer) {
            console.error("MeshRenderer has not been found on HexPiece");
            return;
        }

        let material: Material | null = null;

        // Enum keys are case-sensitive matching the original declaration
        switch (this.color) {
            case HexColor.Red:
                material = this.redMaterial;
                break;
            case HexColor.Blue:
                material = this.blueMaterial;
                break;
            case HexColor.Green:
                material = this.greenMaterial;
                break;
            case HexColor.Yellow:
                material = this.yellowMaterial;
                break;
            case HexColor.Purple:
                material = this.purpleMaterial;
                break;
            case HexColor.Orange:
                material = this.orangeMaterial;
                break;
            case HexColor.Pink:
                material = this.pinkMaterial;
                break;
        }

        if (!material) {
            console.error("Material missing for color:", HexColor[this.color]);
            return;
        }

        this.meshRenderer.setMaterial(material, 0);
    }

    public getColor(): HexColor {
        return this.color;
    }
}


