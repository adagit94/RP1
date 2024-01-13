type TDosProtectionConf = {
  sourceConnectionsLimit: number;
};

interface IDosProtection {
  addConnection: (source: string) => void;
  subtractConnection: (source: string) => void;
  verify: (source: string) => boolean;
}

export class DosProtection implements IDosProtection {
  private conf: TDosProtectionConf;

  /**
   * @param {number} conf.sourceConnectionsLimit - max. count of connections per domain/ip address
   */
  constructor(conf: TDosProtectionConf) {
    this.conf = conf;
  }

  private connections: Record<string, number> = {};

  public addConnection = (source: string) => {
    this.connections = { ...this.connections, [source]: this.connections[source] + 1 };
  };

  public subtractConnection = (source: string) => {
    this.connections = { ...this.connections, [source]: this.connections[source] - 1 };
  };

  public verify = (source: string) => this.connections[source] <= this.conf.sourceConnectionsLimit;
}
