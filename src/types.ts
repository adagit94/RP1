export enum ServerMetric {
  Connections = 'connections',
  Cpu = 'cpu',
}

export type ServerSettings = {
  host: string;
};

export type ServerInfo = {
  [ServerMetric.Connections]: number;
  [ServerMetric.Cpu]: number;
};

export type ServerState = {
  connections: number;
};
