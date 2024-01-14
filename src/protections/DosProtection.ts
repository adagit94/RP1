type TDosProtectionConf = {
  ipConnectionsLimit: number;
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
   */
  constructor(conf: TDosProtectionConf) {
    this.conf = conf;
  }

  private connections: Record<string, number> = {};

  public addConnection = (ip: string) => {
    this.connections = { ...this.connections, [ip]: (this.connections[ip] ?? 0) + 1 };
  };

  public subtractConnection = (ip: string) => {
    this.connections = { ...this.connections, [ip]: this.connections[ip] - 1 };
  };

  public verify = (ip: string) => this.connections[ip] <= this.conf.ipConnectionsLimit;
}
