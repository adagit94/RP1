type TDosProtectionConf = {
  ipConnectionsLimit: number;
  totalConnectionsLimit: number | undefined
};

interface IDosProtection {
  addConnection: (ip: string) => void;
  subtractConnection: (ip: string) => void;
  verify: (ip: string) => boolean;
}

export class DosProtection implements IDosProtection {
  private conf: TDosProtectionConf;

  /**
   * @param {number} conf.ipConnectionsLimit - max. count of connections per domain/ip address
   * @param {number} conf.totalConnectionsLimit - max. count of connections sum
   */
  constructor(conf: TDosProtectionConf) {
    this.conf = conf;
  }

  private connections: Record<string, number> = {};
  private connectionsSum = 0;

  public addConnection = (ip: string) => {
    this.connections = { ...this.connections, [ip]: (this.connections[ip] ?? 0) + 1 };

    if (this.conf.totalConnectionsLimit !== undefined) this.connectionsSum++
  };

  public subtractConnection = (ip: string) => {
    this.connections = { ...this.connections, [ip]: this.connections[ip] - 1 };

    if (this.conf.totalConnectionsLimit !== undefined) this.connectionsSum--
  };

  public verify = (ip: string) => this.connections[ip] <= this.conf.ipConnectionsLimit && (this.conf.totalConnectionsLimit === undefined || this.connectionsSum <= this.conf.totalConnectionsLimit);
}
