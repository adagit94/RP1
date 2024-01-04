export type ServerSettings = {
  host: string;
};

export enum RemoteServerMetric {
  Connections = 'connections',
  Cpu = 'cpu',
}


export type RemoteServerState = {
  [RemoteServerMetric.Connections]: number;
  [RemoteServerMetric.Cpu]: number;
};

export type ServerState = {
  connections: number;
};
