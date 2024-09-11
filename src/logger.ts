export default class Logger {
	private logEnabled: boolean;

	constructor(logEnabled: boolean = true) {
		this.logEnabled = logEnabled;
	}

	public setLogEnabled(enabled: boolean): void {
		this.logEnabled = enabled;
	}

	public info(message: string): void {
		this.log("INFO", message);
	}

	private log(level: string, message: string): void {
		const timestamp = new Date().toISOString();
		console.log(`[${timestamp}] [${level}] ${message}`);
	}
}
