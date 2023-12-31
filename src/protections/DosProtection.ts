type TDosProtectionConf = {
    connectionsLimit: number;
};

interface IDosProtection {
    addConnection: () => number;
    subtractConnection: () => number;
    verify: () => boolean;
}

export class DosProtection implements IDosProtection {
    private conf: TDosProtectionConf;

    /**
     * @param {number} conf.connectionsLimit - max. count of connections (across origins)
     */
    constructor(conf: TDosProtectionConf) {
        this.conf = conf;
    }

    private connections = 0;

    public addConnection = () => ++this.connections;

    public subtractConnection = () => --this.connections;

    public verify = () => this.connections <= this.conf.connectionsLimit;
}
