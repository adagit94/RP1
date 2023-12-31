import http from 'node:http';
import { dosProtection } from './proxy.js';

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : undefined;

export const gate = (req: http.IncomingMessage, res: http.ServerResponse): boolean => {
  const { headers } = req;
  const { origin } = headers;

  if (ALLOWED_ORIGINS && (origin === undefined || !ALLOWED_ORIGINS.includes(origin))) {
    res.writeHead(403, `Access from origin ${origin} denied.`);
    res.end();

    return false;
  }

  if (dosProtection && !dosProtection.verify()) {
    res.writeHead(503, `Connection refused: limit overflowed.`, {
      'access-control-allow-origin': origin,
    });
    res.end();

    return false;
  }

  if (process.env.MAX_REQ_BYTES && req.headers['content-length'] && Number(req.headers['content-length']) > Number(process.env.MAX_REQ_BYTES)) {
    res.writeHead(413, `Req. size limit overflowed.`, {
      'access-control-allow-origin': origin,
    });
    res.end();

    return false;
  }

  return true;
};
