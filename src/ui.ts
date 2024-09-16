interface UIElementMappings {
	sliceButton: HTMLButtonElement | undefined;
	viewSliceButton: HTMLButtonElement | undefined;
	layerNumberInput: HTMLInputElement | undefined;
}

type SliceCallback = () => boolean;
type ViewSliceCallback = (layerNumber: number) => boolean;

export default class SlicerUI {
	constructor(public elementMappings: UIElementMappings) {
		this.resetUI();
	}

	public resetUI(): void {
		if (this.elementMappings.sliceButton)
			this.elementMappings.sliceButton.disabled = true;
		if (this.elementMappings.viewSliceButton)
			this.elementMappings.viewSliceButton.disabled = true;

		if (this.elementMappings.layerNumberInput)
			this.elementMappings.layerNumberInput.value = "";
	}

	public onSliceReady(): void {
		if (this.elementMappings.sliceButton)
			this.elementMappings.sliceButton.disabled = false;
	}

	public registerSliceCallback(callback: SliceCallback): boolean {
		if (!this.elementMappings.sliceButton) return false;

		this.elementMappings.sliceButton.addEventListener(
			"click",
			(_ev: Event) => {
				if (callback()) {
					if (this.elementMappings.viewSliceButton)
						this.elementMappings.viewSliceButton.disabled = false;
				}
			}
		);

		return true;
	}

	public registerViewSliceCallback(callback: ViewSliceCallback): boolean {
		if (
			!this.elementMappings.viewSliceButton ||
			!this.elementMappings.layerNumberInput
		)
			return false;

		const inputFieldEl = this.elementMappings.layerNumberInput;
		this.elementMappings.viewSliceButton.addEventListener(
			"click",
			(_ev: Event) => {
				const fieldValue = Math.max(0, parseInt(inputFieldEl.value));
				callback(fieldValue);
			}
		);

		return true;
	}
}
