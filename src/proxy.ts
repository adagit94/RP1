import 'dotenv/config';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import { DosProtection } from './protections/DosProtection.js';
import { ServerSettings, ServerState } from './types.js';
import { evaluatePreferedServerIndex, parseServersSettings, parseServersUsageMetric } from './utils.js';

const {
  PORT,
  ALLOWED_ORIGINS,
  SERVERS,
  // SERVERS_USAGE_METRIC,
  // SERVERS_CHECK_INTERVAL,
  CONNECTIONS_LIMIT,
  CONNECTION_TIMEOUT,
  REQ_TRANSFER_TIMEOUT,
  MAX_REQ_BYTES,
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

const proxy = https
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
        if (allowedOrigins && (origin === undefined || !allowedOrigins.includes(origin))) {
          res.writeHead(403, `Access from origin ${origin} denied.`);
          res.end();
          return;
        }

        if (!dosProtection.verify()) {
          res.writeHead(503, `Connection refused: limit overflowed.`, {
            'access-control-allow-origin': origin,
          });
          res.end();
          return;
        }

        if (req.headers['content-length'] && Number(req.headers['content-length']) > Number(MAX_REQ_BYTES)) {
          res.writeHead(413, `Req. size limit overflowed.`, {
            'access-control-allow-origin': origin,
          });
          res.end();
          return;
        }

        await sent(req, res);
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

const sent = async (req: http.IncomingMessage, res: http.ServerResponse) => {
  if (req.url === undefined) {
    res.writeHead(400, 'Url not found.');
    res.end();
    return;
  }

  const preferedServer = serversSettings[evaluatePreferedServerIndex(serversStates)];
  let urlIn = new URL(req.url, `https://${req.headers.host}`);

  urlIn.host = preferedServer.host;
  urlIn.protocol = 'http';

  const urlOut = new URL(urlIn);
  const serverReq = http.request(urlOut, { method: req.method }, serverRes => {});
};
