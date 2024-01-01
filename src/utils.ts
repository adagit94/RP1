import http from 'node:http';
import { RemoteServerState, RemoteServerMetric, ServerSettings, ServerState } from './types.js';
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

    if (serversSettings.length === 0) throw new Error(`No servers defined.`);

    return serversSettings;
  } catch (err) {
    throw new Error(`SERVERS env. variable parsing failed.\n${err}`);
  }
};

export const parseRemoteServerState = (jsonStr: string) => {
  return parsers.runParser(
    parsers.object<RemoteServerState>({
      [RemoteServerMetric.Connections]: parsers.number,
      [RemoteServerMetric.Cpu]: parsers.number,
    }),
    JSON.parse(jsonStr)
  );
};

export const parseServersUsageMetric = (x: unknown): RemoteServerMetric | undefined => {
  try {
    return parsers.runParser(parsers.optional(parsers.shallowEnum(RemoteServerMetric)), x);
  } catch (err) {
    throw new Error(`SERVERS_USAGE_METRIC env. variable parsing failed.\n${err}`);
  }
};

export const receiveData = (input: http.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let dataStr = '';

    input.setEncoding('utf8');

    input.on('data', chunk => {
      dataStr += chunk;
    });

    input.on('end', () => {
      resolve(dataStr);
    });

    input.on('error', reject);
  });

export const receiveJson = (res: http.IncomingMessage): Promise<string> => {
  if (res.headers['content-type'] !== 'application/json') {
    throw new Error("Content-Type header isn't application/json.");
  }

  return receiveData(res);
};

export const collectServersInfos = async (serversSettings: ServerSettings[]): Promise<RemoteServerState[]> => {
  const reqs: Promise<RemoteServerState>[] = serversSettings.map(
    s =>
      new Promise((resolve, reject) => {
        const url = `http://${s.host}/info`;
        const getErrMsg = (err: unknown) => `GET ${url}: ${err}`;
        const req = http.get(url, async res => {
          try {
            if (res.statusCode === 200) {
              const jsonStr = await receiveJson(res);
              const info = parseRemoteServerState(jsonStr);

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
  let infos: RemoteServerState[] = [];

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

// export const evaluatePreferedServer = (states: RemoteServerState[], metric: RemoteServerMetric = RemoteServerMetric.Connections) =>
//   states.reduce((prev, curr) => (curr[metric] < prev[metric] ? curr : prev));

export const evaluatePreferedServer = (states: ServerState[]): [ServerState, number] => {
  let serverState = states[0];
  let index = 0;

  for (let i = 1; i < states.length; i++) {
    const s = states[i];

    if (s.connections < serverState.connections) {
      index = i;
      serverState = s;
    }
  }

  return [serverState, index];
};

export const createUrlOut = (url: string, host: string | undefined, serverSettings: ServerSettings) => {
  let urlIn = new URL(url, `https://${host}`);

  urlIn.host = serverSettings.host;
  urlIn.protocol = 'http:';

  return new URL(urlIn);
};
