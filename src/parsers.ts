// ISC License

// Copyright 2024 Tomáš Stejskal & Adam Pelc

// Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

export type Parser<T, U> = (v: T, ctx: ParsingCtx) => U;

export const runParser = <T, U>(parser: Parser<T, U>, v: T) => {
  return parser(v, newParsingCtx());
};

export type ParsingCtx = () => Array<string>;

const newParsingCtx = (): ParsingCtx => () => [];

const pushToCtx =
  (ctx: ParsingCtx, msg: string): ParsingCtx =>
  () =>
    [msg, ...ctx()];

const error = (msg: string, ctx: ParsingCtx) => {
  let s = msg;
  if (ctx) {
    ctx().forEach(x => {
      s += ` in ${x}`;
    });
  }
  return new Error(s);
};

export const compose =
  <T, U, V>(a: Parser<T, U>, b: Parser<U, V>): Parser<T, V> =>
  (v: T, ctx: ParsingCtx) =>
    b(a(v, ctx), ctx);

export const string: Parser<unknown, string> = (v, ctx) => {
  if (typeof v === 'string') {
    return v;
  }
  throw error(`Value ${String(v)} is not a string`, ctx);
};

export const boolean: Parser<unknown, boolean> = (v, ctx) => {
  if (typeof v === 'boolean') {
    return v;
  }
  throw error(`Value ${String(v)} is not a boolean`, ctx);
};

export const number: Parser<unknown, number> = (v, ctx) => {
  if (typeof v === 'number') {
    return v;
  }
  throw error(`Value ${String(v)} is not a number`, ctx);
};

const isRecord = (v: unknown): v is Record<any, any> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const object =
  <T extends { [k in keyof T]: T[k] }>(o: { [k in keyof T]: Parser<unknown, T[k]> }): Parser<unknown, T> =>
  (input: unknown, ctx: ParsingCtx): T => {
    if (isRecord(input)) {
      let obj: T | Record<any, never> = {};

      Object.entries(o).forEach(([k, v]) => {
        const key = k as keyof T;
        const parser = v as Parser<unknown, T[keyof T]>;

        const ctx2 = pushToCtx(ctx, `object property ${String(key)}`);

        let u: T[keyof T];

        if (Object.prototype.hasOwnProperty.call(input, key)) {
          u = parser(input[key], ctx2);
        } else {
          u = parser(undefined, ctx2);
        }

        obj[key] = u;
      });

      return obj;
    }

    throw error(`Value ${String(input)} is not an object`, ctx);
  };

export const record: Parser<unknown, object> = (v, ctx) => {
  if (isRecord(v)) {
    return v;
  }

  throw error(`Value ${String(v)} is not an object`, ctx);
};

export const array =
  <T, U>(itemParser: Parser<T, U>): Parser<T, Array<U>> =>
  (v, ctx) => {
    if (Array.isArray(v)) {
      let arr: U[] = [];

      for (let i = 0; i < v.length; i++) {
        const item = v[i];
        const ctx2 = pushToCtx(ctx, `array at index ${i}`);

        arr.push(itemParser(item, ctx2));
      }

      return arr;
    }

    throw error(`Value ${String(v)} is not an array`, ctx);
  };

export const optional =
  <T, U>(parser: Parser<T, U>): Parser<T, U | undefined> =>
  (v, ctx) => {
    if (typeof v === 'undefined') {
      return undefined;
    }
    return parser(v, ctx);
  };

export const nullable =
  <T, U>(parser: Parser<T, U>): Parser<T, U | null> =>
  (v, ctx) => {
    if (v === null) {
      return null;
    }
    return parser(v, ctx);
  };

export const withDefault =
  <T, U>(parser: Parser<T, U>, def: U | (() => U)): Parser<T, U> =>
  (v, ctx) => {
    if (v === null || v === undefined) {
      if (def instanceof Function) {
        return def();
      }

      return def;
    }

    return parser(v, ctx);
  };

export const map =
  <T, U, V>(parser: Parser<T, U>, f: (x: U) => V): Parser<T, V> =>
  (v, ctx) =>
    f(parser(v, ctx));

export const constant =
  <T, U>(x: U) =>
  (_v: T, _ctx: ParsingCtx) =>
    x;

export const identity = <T>(v: T, _ctx: ParsingCtx) => v;

export const unknown = (v: unknown, _ctx: ParsingCtx) => v;

export const lift =
  <T, U>(f: (x: T) => U) =>
  (v: T, _ctx: ParsingCtx) =>
    f(v);

export const alt =
  <T, U>(...parsers: Array<Parser<T, U>>): Parser<T, U> =>
  (v: T, ctx: ParsingCtx) => {
    let err: any;
    for (const parser of parsers) {
      try {
        return parser(v, ctx);
      } catch (e) {
        // ignore the exception and try another parser
        err = e;
      }
    }
    if (err) {
      throw err;
    }
    throw error('Unexpected data', ctx);
  };

export const preCondition =
  <T, U>(parser: Parser<T, U>, pred: (v: T) => string | undefined): Parser<T, U> =>
  (v, ctx) => {
    const msg = pred(v);
    if (msg !== undefined) {
      throw error(msg, ctx);
    }
    return parser(v, ctx);
  };

export const postCondition =
  <T, U>(parser: Parser<T, U>, pred: (result: U) => string | undefined): Parser<T, U> =>
  (v, ctx) => {
    const result = parser(v, ctx);
    const msg = pred(result);
    if (msg !== undefined) {
      throw error(msg, ctx);
    }
    return result;
  };

export const url = postCondition(string, s => {
  try {
    new URL(s);
  } catch {
    return `Invalid URL "${s}"`;
  }
});

export const shallowEnum =
  <T>(enumObject: { [k in keyof T]: T[k] }): Parser<unknown, T[keyof T]> =>
  (input: unknown, ctx: ParsingCtx): T[keyof T] => {
    const isEnumValue = (input: unknown): input is T[keyof T] => Object.values(enumObject).includes(input);

    if (!isEnumValue(input)) {
      throw error(`Value ${input} isnt't enum value.`, ctx);
    }

    return input;
  };

export const deepEnum =
  <T, U extends T[keyof T]>(expectedInput: U): Parser<unknown, U> =>
  (input: unknown, ctx: ParsingCtx): U => {
    const isEnumValue = (input: unknown): input is U => input === expectedInput;

    if (!isEnumValue(input)) {
      throw error(`Value ${input} isn't expected enum value.`, ctx);
    }

    return input;
  };
