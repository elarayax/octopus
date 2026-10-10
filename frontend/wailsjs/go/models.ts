export namespace main {
	
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

