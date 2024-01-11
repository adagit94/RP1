import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import fs from 'node:fs';
import { DosProtection } from './protections/DosProtection.js';
import { ServerSettings, ServerState } from './types.js';
import { createUrlOut, evaluatePreferedServer, parseServersSettings, receiveData } from './utils.js';

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
if (typeof Number(CONNECTIONS_LIMIT) !== 'number') throw new Error('CONNECTIONS_LIMIT env. variable number must be provided.');
if (typeof Number(CONNECTION_TIMEOUT) !== 'number') throw new Error('CONNECTION_TIMEOUT env. variable number must be provided.');
if (typeof Number(REQ_TRANSFER_TIMEOUT) !== 'number') throw new Error('REQ_TRANSFER_TIMEOUT env. variable number must be provided.');
if (typeof Number(MAX_REQ_BYTES) !== 'number') throw new Error('MAX_REQ_BYTES env. variable number must be provided.');

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
  const preferedServerReq = http.request(createUrlOut(req.url, req.headers.host, preferedServerSettings), {
    method: req.method,
    headers: { ...req.headers, origin: `https://${req.headers.host}` },
  });

  preferedServerReq.once('response', async preferedServerRes => {
    res.writeHead(preferedServerRes.statusCode ?? 0, preferedServerRes.statusMessage,  preferedServerRes.headers);
    preferedServerRes.pipe(res);
  });

  preferedServerReq.once('close', () => {
    preferedServerState.connections--;
  });

  req.pipe(preferedServerReq);
  preferedServerState.connections++;
};
