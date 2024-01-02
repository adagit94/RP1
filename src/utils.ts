import http from 'node:http';
import { ServerInfo, ServerMetric, ServerSettings, ServerState } from './types.js';
import * as parsers from './parsers.js';

export const parseServersSettings = (x: unknown) => {
  if (x === undefined) throw new Error('SERVERS env. variable must be provided.');

  try {
    const str = parsers.runParser(parsers.string, x);
    const serversSettings = parsers.runParser(
      parsers.array(
        parsers.object<ServerSettings>({
          host: parsers.string,
        })
      ),
      JSON.parse(str)
    );

    if (serversSettings.length === 0) throw new Error(`No servers defined.`)

    return serversSettings
  } catch (err) {
    throw new Error(`SERVERS env. variable parsing failed.\n${err}`);
  }
};

export const parseServerInfo = (jsonStr: string) => {
  return parsers.runParser(
    parsers.object<ServerInfo>({
      [ServerMetric.Connections]: parsers.number,
      [ServerMetric.Cpu]: parsers.number,
    }),
    JSON.parse(jsonStr)
  );
};

export const parseServersUsageMetric = (x: unknown): ServerMetric | undefined => {
  try {
    return parsers.runParser(parsers.optional(parsers.shallowEnum(ServerMetric)), x);
  } catch (err) {
    throw new Error(`SERVERS_USAGE_METRIC env. variable parsing failed.\n${err}`);
  }
};

export const receiveJson = (res: http.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    if (res.headers['content-type'] !== 'application/json') {
      reject(new Error("Content-Type header isn't application/json."));
      return;
    }

    let dataStr = '';

    res.setEncoding('utf8');

    res.on('data', chunk => {
      dataStr += chunk;
    });

    res.on('end', () => {
      resolve(dataStr);
    });

    res.on('error', reject);
  });

export const collectServersInfos = async (serversSettings: ServerSettings[]): Promise<ServerInfo[]> => {
  const reqs: Promise<ServerInfo>[] = serversSettings.map(
    s =>
      new Promise((resolve, reject) => {
        const url = `http://${s.host}/info`;
        const getErrMsg = (err: unknown) => `GET ${url}: ${err}`;
        const req = http.get(url, async res => {
          try {
            if (res.statusCode === 200) {
              const jsonStr = await receiveJson(res);
              const info = parseServerInfo(jsonStr);

              resolve(info);
            } else {
              throw new Error(`status code: ${res.statusCode}`);
            }
          } catch (err) {
            reject(getErrMsg(err));
          }
        });

        req.on('error', err => reject(getErrMsg(err)));
      })
  );

  const results = await Promise.allSettled(reqs);
  let infos: ServerInfo[] = [];

  for (const result of results) {
    switch (result.status) {
      case 'fulfilled':
        infos.push(result.value);
        break;

      case 'rejected':
        console.error(result.reason);
        // trigger some notification mechanism
        break;
    }
  }

  return infos;
};

export const evaluatePreferedServerInfo = (serversInfos: ServerInfo[], metric: ServerMetric = ServerMetric.Connections) =>
  serversInfos.reduce((prev, curr) => (curr[metric] < prev[metric] ? curr : prev));

export const evaluatePreferedServerIndex = (serversStates: ServerState[]) => {
  let serverState: ServerState | undefined;
  let index = -1

  for (let i = 0; i < serversStates.length; i++) {
    const s = serversStates[i];

    if (serverState === undefined || s.connections < serverState.connections) {
      index = i;
    }
  }

  return index;
};
