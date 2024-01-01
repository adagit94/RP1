import http from 'node:http';
import { ServerInfo, ServerSettings } from './types.js';
import * as parsers from './parsers.js';

export const parseServersSettings = (str: string) => {
  try {
    return parsers.runParser(
      parsers.array(
        parsers.object<ServerSettings>({
          url: parsers.string,
        })
      ),
      JSON.parse(str)
    );
  } catch (err) {
    throw new Error(`SERVERS env. variable parsing failed\n${err}`);
  }
};

export const parseServerInfo = (jsonStr: string) => {
  return parsers.runParser(
    parsers.object<ServerInfo>({
      connections: parsers.number,
    }),
    JSON.parse(jsonStr)
  );
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
        const url = `${s.url}/info`;
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
