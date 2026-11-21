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
	export class CanalEntry {
	    codigo: string;
	    nombre: string;
	    subtitulo: string;
	    icono: string;
	    ultimaVez: string;
	
	    static createFrom(source: any = {}) {
	        return new CanalEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.codigo = source["codigo"];
	        this.nombre = source["nombre"];
	        this.subtitulo = source["subtitulo"];
	        this.icono = source["icono"];
	        this.ultimaVez = source["ultimaVez"];
	    }
	}
	export class ChannelInfo {
	    nombre: string;
	    subtitulo: string;
	    icono: string;
	
	    static createFrom(source: any = {}) {
	        return new ChannelInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.nombre = source["nombre"];
	        this.subtitulo = source["subtitulo"];
	        this.icono = source["icono"];
	    }
	}
	export class Message {
	    sender: string;
	    text: string;
	    kind: string;
	    image?: string;
	    time?: string;
	    id?: string;
	    replyTo?: string;
	    reactions?: Record<string, Array<string>>;
	
	    static createFrom(source: any = {}) {
	        return new Message(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sender = source["sender"];
	        this.text = source["text"];
	        this.kind = source["kind"];
	        this.image = source["image"];
	        this.time = source["time"];
	        this.id = source["id"];
	        this.replyTo = source["replyTo"];
	        this.reactions = source["reactions"];
	    }
	}
	export class ModVideo {
	    mode: string;
	    shape: string;
	    mirror: boolean;
	    showNames: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ModVideo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mode = source["mode"];
	        this.shape = source["shape"];
	        this.mirror = source["mirror"];
	        this.showNames = source["showNames"];
	    }
	}
	export class ModLayout {
	    themeName: string;
	    sidebarPosition: string;
	    panels: Record<string, boolean>;
	    video?: ModVideo;
	
	    static createFrom(source: any = {}) {
	        return new ModLayout(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.themeName = source["themeName"];
	        this.sidebarPosition = source["sidebarPosition"];
	        this.panels = source["panels"];
	        this.video = this.convertValues(source["video"], ModVideo);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
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
	export class UserEntry {
	    name: string;
	    online: boolean;
	    avatar: string;
	    self: boolean;
	
	    static createFrom(source: any = {}) {
	        return new UserEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.online = source["online"];
	        this.avatar = source["avatar"];
	        this.self = source["self"];
	    }
	}

}

