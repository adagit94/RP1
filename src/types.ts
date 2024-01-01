export enum ServerMetric {
  Connections = 'connections',
  Cpu = 'cpu',
}

export type ServerSettings = {
  host: string;
};

export type ServerInfo = {
  host: string;
  [ServerMetric.Connections]: number;
  [ServerMetric.Cpu]: number;
};
