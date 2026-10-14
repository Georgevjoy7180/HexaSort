import {
    _decorator,
    Component,
    Node,
    Graphics,
    Label,
    Color,
    UITransform,
    Button,
    Layers,
    tween,
    Tween,
    Vec3
} from 'cc';


const { ccclass } = _decorator;


/**
 * Builds and owns the end-card: "GREAT! / KEEP SORTING" + a pulsing PLAY NOW
 * button. Built entirely at runtime (no texture/font assets required) so it
 * stays a couple of draw calls and adds nothing to the download size.
 */
@ccclass('CTAController')
export class CTAController extends Component {

    private panel: Node | null = null;


    public init(uiRoot: Node, canvasWidth: number, canvasHeight: number) {

        this.buildUI(uiRoot, canvasWidth, canvasHeight);

    }


    private buildUI(uiRoot: Node, width: number, height: number) {

        const panel = new Node('CTAPanel');

        panel.layer = Layers.Enum.UI_2D;
        uiRoot.addChild(panel);
        panel.setSiblingIndex(9999);

        const overlay = new Node('Overlay');

        overlay.layer = Layers.Enum.UI_2D;
        panel.addChild(overlay);
        overlay.addComponent(UITransform).setContentSize(width, height);

        const overlayGfx = overlay.addComponent(Graphics);

        overlayGfx.fillColor = new Color(10, 10, 20, 150);
        overlayGfx.rect(-width / 2, -height / 2, width, height);
        overlayGfx.fill();

        const great = new Node('GreatLabel');

        great.layer = Layers.Enum.UI_2D;
        panel.addChild(great);
        great.setPosition(0, height * 0.15, 0);

        const greatUt = great.addComponent(UITransform);
        greatUt.setContentSize(width * 0.9, 140);

        const greatLabel = great.addComponent(Label);
        greatLabel.string = 'GREAT!';
        greatLabel.fontSize = 96;
        greatLabel.lineHeight = 100;
        greatLabel.isBold = true;
        greatLabel.color = new Color(255, 214, 64, 255);
        greatLabel.enableOutline = true;
        greatLabel.outlineColor = new Color(70, 42, 0, 255);
        greatLabel.outlineWidth = 5;

        const sub = new Node('SubLabel');

        sub.layer = Layers.Enum.UI_2D;
        panel.addChild(sub);
        sub.setPosition(0, height * 0.15 - 100, 0);

        const subUt = sub.addComponent(UITransform);
        subUt.setContentSize(width * 0.9, 80);

        const subLabel = sub.addComponent(Label);
        subLabel.string = 'KEEP SORTING';
        subLabel.fontSize = 42;
        subLabel.isBold = true;
        subLabel.color = new Color(255, 255, 255, 255);

        const btnWidth = Math.min(width * 0.72, 620);
        const btnHeight = btnWidth * 0.3;

        // The idle "pulse" animates this wrapper; the Button's own press
        // feedback animates btnNode below — two nodes so the two scale
        // animations don't fight over the same property.
        const btnWrapper = new Node('PlayNowButtonPulse');

        btnWrapper.layer = Layers.Enum.UI_2D;
        panel.addChild(btnWrapper);
        btnWrapper.setPosition(0, -height * 0.15, 0);

        const btnNode = new Node('PlayNowButton');

        btnNode.layer = Layers.Enum.UI_2D;
        btnWrapper.addChild(btnNode);
        btnNode.addComponent(UITransform).setContentSize(btnWidth, btnHeight);

        const btnGfx = btnNode.addComponent(Graphics);
        const r = btnHeight / 2;

        btnGfx.fillColor = new Color(64, 200, 96, 255);
        btnGfx.roundRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, r);
        btnGfx.fill();

        btnGfx.strokeColor = new Color(255, 255, 255, 255);
        btnGfx.lineWidth = 6;
        btnGfx.roundRect(-btnWidth / 2, -btnHeight / 2, btnWidth, btnHeight, r);
        btnGfx.stroke();

        const btnLabelNode = new Node('Label');

        btnLabelNode.layer = Layers.Enum.UI_2D;
        btnNode.addChild(btnLabelNode);
        btnLabelNode.addComponent(UITransform).setContentSize(btnWidth, btnHeight);

        const btnLabel = btnLabelNode.addComponent(Label);
        btnLabel.string = 'PLAY NOW';
        btnLabel.fontSize = 46;
        btnLabel.isBold = true;
        btnLabel.color = new Color(255, 255, 255, 255);

        const button = btnNode.addComponent(Button);
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 1.08;
        button.target = btnNode;

        btnNode.on(Button.EventType.CLICK, this.onPlayNowClicked, this);

        tween(btnWrapper)
            .repeatForever(
                tween<Node>()
                    .to(0.55, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'sineInOut' })
                    .to(0.55, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' })
            )
            .start();

        panel.active = false;

        this.panel = panel;

    }


    public show() {

        if (!this.panel)
            return;

        this.panel.active = true;
        this.panel.setScale(0.7, 0.7, 1);

        Tween.stopAllByTarget(this.panel);

        tween(this.panel)
            .to(0.32, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .start();

    }


    private onPlayNowClicked() {

        this.openStore();

    }


    // Playable-ad SDKs hook their store/click-through call in here; kept as
    // the single seam so no ad-network code has to spread through gameplay.
    public openStore(): void {

        const storeUrl = 'https://play.google.com/store/apps/details?id=com.gamebrain.hexasort';

        console.log('[CTAController] Redirecting to store:', storeUrl);

        const win = window as any;

        // MRAID (AppLovin, Unity Ads, IronSource, Vungle, etc.)
        if (typeof win.mraid !== 'undefined') {
            if (typeof win.mraid.open === 'function') {
                win.mraid.open(storeUrl);
                return;
            }
        }

        // Facebook / Meta Playable Ads
        if (typeof win.FbPlayableAd !== 'undefined' && typeof win.FbPlayableAd.onCTAClick === 'function') {
            win.FbPlayableAd.onCTAClick();
            return;
        }

        // Mintegral / DAPI
        if (typeof win.dapi !== 'undefined' && typeof win.dapi.openStoreUrl === 'function') {
            win.dapi.openStoreUrl(storeUrl);
            return;
        }

        // Google / generic web fallback
        if (typeof window !== 'undefined' && window.open) {
            window.open(storeUrl, '_blank');
        } else if (typeof window !== 'undefined' && window.location) {
            window.location.href = storeUrl;
        }

    }

}
