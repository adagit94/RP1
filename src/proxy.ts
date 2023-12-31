import 'dotenv/config';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import { setInterval } from 'node:timers';
import { gate } from './gate.js';
import { DosProtection } from './protections/DosProtection.js';
import { ServerInfo, ServerSettings } from './types.js';
import { parseServersSettings } from './utils.js';

const { SERVERS, SERVERS_CHECK_INTERVAL, CONNECTIONS_LIMIT, CONNECTION_TIMEOUT, REQ_TRANSFER_TIMEOUT } = process.env;

if (Number.isNaN(SERVERS_CHECK_INTERVAL)) throw new Error('SERVERS_CHECK_INTERVAL env. variable must be provided.');

const serversSettings: ServerSettings[] = parseServersSettings(SERVERS);
let serversInfos: ServerInfo[] = [];

export const dosProtection = CONNECTIONS_LIMIT ? new DosProtection({ connectionsLimit: Number(process.env.CONNECTIONS_LIMIT) }) : undefined;

const proxy = https
  .createServer(
    {
      key: fs.readFileSync('cert/key.pem'),
      cert: fs.readFileSync('cert/cert.pem'),
      requestTimeout: Number.isNaN(REQ_TRANSFER_TIMEOUT) ? undefined : Number(REQ_TRANSFER_TIMEOUT),
      connectionsCheckingInterval: 1000,
    },
    (req, res) => {
      try {
        if (dosProtection) {
          dosProtection.addConnection();
          res.once('close', dosProtection.subtractConnection);
        }

        if (!Number.isNaN(CONNECTION_TIMEOUT)) req.setTimeout(Number(CONNECTION_TIMEOUT));

        if (req.url === undefined) {
          res.writeHead(400, 'Url not found.');
          res.end();

          return;
        }

        if (!gate(req, res)) return;
      } catch (err) {
        console.error(err);

        if (!req.closed) {
          res.writeHead(500, `Internal server error.`);
          res.end();
        }
      }
    }
  )
  .listen(process.env.PORT);

setInterval(() => {
  let infos: ServerInfo[] = [];
  let reqs = serversSettings.map(s => http.get());

  serversInfos.push();
}, Number(SERVERS_CHECK_INTERVAL));
