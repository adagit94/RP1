import { ServerSettings } from './types.js';
import * as parsers from './parsers.js';

export const parseServersSettings = (x: unknown) => {
  try {
    const str = parsers.runParser(parsers.string, x)
    
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
