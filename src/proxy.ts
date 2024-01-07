import 'dotenv/config';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import { DosProtection } from './protections/DosProtection.js';
import { ServerSettings, ServerState } from './types.js';
import { createUrlOut, evaluatePreferedServer, parseServersSettings, parseServersUsageMetric } from './utils.js';

const {
  PORT,
  ALLOWED_ORIGINS,
  SERVERS,
  CONNECTIONS_LIMIT,
  CONNECTION_TIMEOUT,
  REQ_TRANSFER_TIMEOUT,
  MAX_REQ_BYTES,
  // SERVERS_USAGE_METRIC,
  // SERVERS_CHECK_INTERVAL,
} = process.env;

// if (Number.isNaN(SERVERS_CHECK_INTERVAL)) throw new Error('SERVERS_CHECK_INTERVAL env. variable number must be provided.');
if (Number.isNaN(CONNECTIONS_LIMIT)) throw new Error('CONNECTIONS_LIMIT env. variable number must be provided.');
if (Number.isNaN(CONNECTION_TIMEOUT)) throw new Error('CONNECTION_TIMEOUT env. variable number must be provided.');
if (Number.isNaN(REQ_TRANSFER_TIMEOUT)) throw new Error('REQ_TRANSFER_TIMEOUT env. variable number must be provided.');
if (Number.isNaN(MAX_REQ_BYTES)) throw new Error('MAX_REQ_BYTES env. variable number must be provided.');

// const usageMetric = parseServersUsageMetric(SERVERS_USAGE_METRIC);
const serversSettings: ServerSettings[] = parseServersSettings(SERVERS);
const serversStates: ServerState[] = serversSettings.map(() => ({ connections: 0 }));
const dosProtection = new DosProtection({ connectionsLimit: Number(CONNECTIONS_LIMIT) });
const allowedOrigins = ALLOWED_ORIGINS ? ALLOWED_ORIGINS.split(',') : undefined;

https
  .createServer(
    {
      key: fs.readFileSync('cert/key.pem'),
      cert: fs.readFileSync('cert/cert.pem'),
      requestTimeout: Number(REQ_TRANSFER_TIMEOUT),
      connectionsCheckingInterval: 1000,
    },
    async (req, res) => {
      try {
        dosProtection.addConnection();
        res.once('close', dosProtection.subtractConnection);

        req.setTimeout(Number(CONNECTION_TIMEOUT));

        // gate
        if (allowedOrigins && (req.headers.origin === undefined || !allowedOrigins.includes(req.headers.origin))) {
          res.writeHead(403, `Access from origin ${req.headers.origin} denied.`);
          res.end();
          return;
        }

        if (!dosProtection.verify()) {
          res.writeHead(503, `Connection refused: limit overflowed.`, {
            'access-control-allow-origin': req.headers.origin,
          });
          res.end();
          return;
        }

        if (req.headers['content-length'] && Number(req.headers['content-length']) > Number(MAX_REQ_BYTES)) {
          res.writeHead(413, `Req. size limit overflowed.`, {
            'access-control-allow-origin': req.headers.origin,
          });
          res.end();
          return;
        }

        await send(req, res);
      } catch (err) {
        console.error(err);

        if (!req.closed) {
          res.writeHead(500, `Internal server error.`);
          res.end();
        }
      }
    }
  )
  .listen(Number(PORT));

const send = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  if (req.method === undefined) {
    res.writeHead(400, 'Method isnt present.');
    res.end();
    return;
  }

  if (req.url === undefined) {
    res.writeHead(400, 'Url isnt present.');
    res.end();
    return;
  }

  const [preferedServerState, preferedServerIndex] = evaluatePreferedServer(serversStates);
  const preferedServerSettings = serversSettings[preferedServerIndex];

  const url = createUrlOut(req.url, req.headers.host, preferedServerSettings);
  let preferedServerHeaders: http.OutgoingHttpHeaders = {};

  for (const [k, v] of Object.entries(req.headers)) {
    preferedServerHeaders[k] = v;
  }

  const preferedServerReq = req.pipe(http.request(url, { method: req.method, headers: preferedServerHeaders }));

  await new Promise((resolve, reject) => {
    try {
      preferedServerReq.on('response', preferedServerRes => {
        try {
          // if (preferedServerRes.statusCode !== undefined) res.statusCode = preferedServerRes.statusCode;

          for (const [k, v] of Object.entries(preferedServerRes.headers)) {
            if (v !== undefined) res.setHeader(k, v);
          }

          preferedServerRes.once('end', () => {
            console.log('res: end');

            res.writeHead(res.statusCode, preferedServerRes.statusMessage);
            res.end();
          });

          preferedServerRes.once('error', err => {
            console.log('res: error', err.cause, err.message);

            res.writeHead(res.statusCode, err.message);
            res.end();
          });

          preferedServerRes.pipe(res);
        } catch (err) {
          reject(err);
        }
      });

      preferedServerReq.once('close', () => {
        console.log('req: close');
        preferedServerState.connections--;
        resolve(undefined);
      });

      preferedServerReq.once('error', err => {
        console.log('req: err', err.cause, err.message);

        res.writeHead(400, err.message);
        res.end();
      });

      preferedServerState.connections++;
    } catch (err) {
      reject(err);
    }
  });
};

// const clientSocket = net.createConnection(Number(PORT), req.headers.host);
// const serverSocket = net.connect(Number(urlOut.port), urlOut.host, () => {
//   // clientSocket.write('HTTP/1.1 200 Connection Established\r\n' + 'Proxy-agent: Proxy');
//   // serverSocket.write(head);
//   serverSocket.pipe(clientSocket);
//   clientSocket.pipe(serverSocket);
// });
