import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import { DosProtection } from './protections/DosProtection.js';
import { ServerSettings, ServerState } from './types.js';
import { createUrlOut, evaluatePreferedServer, parseServersSettings } from './utils.js';

const {
  PORT,
  ALLOWED_ORIGINS,
  ALLOWED_IPS,
  SERVERS,
  TOTAL_CONNECTIONS_LIMIT,
  IP_CONNECTIONS_LIMIT,
  CONNECTION_TIMEOUT,
  REQ_TRANSFER_TIMEOUT,
  MAX_REQ_BYTES,
  // SERVERS_USAGE_METRIC,
  // SERVERS_CHECK_INTERVAL,
} = process.env;

// if (Number.isNaN(SERVERS_CHECK_INTERVAL)) throw new Error('SERVERS_CHECK_INTERVAL env. variable number must be provided.');
if (TOTAL_CONNECTIONS_LIMIT !== undefined && typeof Number(TOTAL_CONNECTIONS_LIMIT) !== 'number') throw new Error('TOTAL_CONNECTIONS_LIMIT env. variable must be number or undefined.');
if (typeof Number(IP_CONNECTIONS_LIMIT) !== 'number') throw new Error('IP_CONNECTIONS_LIMIT env. variable number must be provided.');
if (typeof Number(CONNECTION_TIMEOUT) !== 'number') throw new Error('CONNECTION_TIMEOUT env. variable number must be provided.');
if (typeof Number(REQ_TRANSFER_TIMEOUT) !== 'number') throw new Error('REQ_TRANSFER_TIMEOUT env. variable number must be provided.');
if (typeof Number(MAX_REQ_BYTES) !== 'number') throw new Error('MAX_REQ_BYTES env. variable number must be provided.');

// const usageMetric = parseServersUsageMetric(SERVERS_USAGE_METRIC);
const serversSettings: ServerSettings[] = parseServersSettings(SERVERS);
const serversStates: ServerState[] = serversSettings.map(() => ({ connections: 0 }));
const dosProtection = new DosProtection({ ipConnectionsLimit: Number(IP_CONNECTIONS_LIMIT), totalConnectionsLimit: Number(TOTAL_CONNECTIONS_LIMIT) });
const allowedOrigins = ALLOWED_ORIGINS ? ALLOWED_ORIGINS.split(',') : undefined;
const allowedIPs = ALLOWED_IPS ? ALLOWED_IPS.split(',') : undefined;

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
        req.setTimeout(Number(CONNECTION_TIMEOUT));

        // gate

        if (allowedOrigins && (req.headers.origin === undefined || !allowedOrigins.includes(req.headers.origin))) {
          res.writeHead(403, `Access from origin ${req.headers.origin} denied.`);
          res.end();
          return;
        }

        const ip = req.socket.remoteAddress;

        if (ip === undefined) {
          res.writeHead(400, 'IP address undetectable.');
          res.end();
          return;
        }

        if (allowedIPs && !allowedIPs.includes(ip)) {
          res.writeHead(403, `Access from IP address ${ip} denied.`);
          res.end();
          return;
        }

        dosProtection.addConnection(ip);
        res.once('close', () => dosProtection.subtractConnection(ip));

        if (!dosProtection.verify(ip)) {
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
  if (req.url === undefined) {
    res.writeHead(400, 'Url not found.');
    res.end();
    return;
  }

  const [preferedServerState, preferedServerIndex] = evaluatePreferedServer(serversStates);
  const preferedServerSettings = serversSettings[preferedServerIndex];
  const preferedServerReq = http.request(createUrlOut(req.url, req.headers.host, preferedServerSettings), {
    method: req.method,
    headers: { ...req.headers, origin: req.headers.origin },
  });

  preferedServerReq.once('response', async preferedServerRes => {
    res.writeHead(preferedServerRes.statusCode ?? 0, preferedServerRes.statusMessage, preferedServerRes.headers);
    preferedServerRes.pipe(res);
  });

  preferedServerReq.once('close', () => {
    preferedServerState.connections--;
  });

  req.pipe(preferedServerReq);
  preferedServerState.connections++;
};
