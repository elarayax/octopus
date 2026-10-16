export namespace main {
	
	export class AudioPrefs {
	    micGain: number;
	    playbackGain: number;
	
	    static createFrom(source: any = {}) {
	        return new AudioPrefs(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.micGain = source["micGain"];
	        this.playbackGain = source["playbackGain"];
	    }
	}
	export class Message {
	    sender: string;
	    text: string;
	
	    static createFrom(source: any = {}) {
	        return new Message(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sender = source["sender"];
	        this.text = source["text"];
	    }
	}
	export class ModLayout {
	    themeName: string;
	    sidebarPosition: string;
	    panels: Record<string, boolean>;
	
	    static createFrom(source: any = {}) {
	        return new ModLayout(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.themeName = source["themeName"];
	        this.sidebarPosition = source["sidebarPosition"];
	        this.panels = source["panels"];
	    }
	}
	export class NodeInfo {
	    code: string;
	    multiAddr: string;
	
	    static createFrom(source: any = {}) {
	        return new NodeInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.multiAddr = source["multiAddr"];
	    }
	}

}

