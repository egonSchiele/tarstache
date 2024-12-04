import { Mustache } from "./types";

const uniq = <T>(arr: T[]): T[] => Array.from(new Set(arr));

type Obj = Record<string, string[] | Record<string, any>>;

/* 
given an array of keys like

["user", "emails", "address"]

this will return an object like

{ user: { emails: { address: ["string"] } } }

*/
export const nestedObj = (keys: string[]): Obj => {
  const obj: Obj = {};
  if (keys.length === 0) {
    return obj;
  }
  const key = keys[0];
  if (!obj[key]) {
    obj[key] = keys.length === 1 ? ["string"] : nestedObj(keys.slice(1));
  } else if (Array.isArray(obj[key])) {
    if (keys.length === 1) {
      obj[key] = uniq([...obj[key], "string"]);
    } else {
      obj[key] = [...obj[key], nestedObj(keys.slice(1))];
    }
  } else if (typeof obj[key] === "object") {
    obj[key] = nestedObj(keys.slice(1));
  }
  return obj;
};

/*
smartly merge two objects generated by nestedObj together
*/
export const mergeObj = (obj1: Obj, obj2: Obj): Obj => {
  const keys = uniq([...Object.keys(obj1), ...Object.keys(obj2)]);
  const newObj: Obj = {};
  keys.forEach((key) => {
    if (obj1[key] && obj2[key]) {
      if (Array.isArray(obj1[key]) && Array.isArray(obj2[key])) {
        newObj[key] = uniq([...obj1[key], ...obj2[key]]);
      } else if (
        typeof obj1[key] === "object" &&
        typeof obj2[key] === "object"
      ) {
        newObj[key] = mergeObj(obj1[key] as Obj, obj2[key] as Obj);
      } else if (Array.isArray(obj1[key])) {
        newObj[key] = [...obj1[key], obj2[key]];
      } else if (Array.isArray(obj2[key])) {
        newObj[key] = [...obj2[key], obj1[key]];
      }
    } else if (obj1[key]) {
      newObj[key] = obj1[key];
    } else if (obj2[key]) {
      newObj[key] = obj2[key];
    }
  });
  return newObj;
};

// render a single object to a TypeScript type
export const renderObj = (obj: Obj, level: number = 1): string => {
  const inner = Object.entries(obj)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${"  ".repeat(level)}${key}: ${renderValue(value, level)};`;
      }
      return `${"  ".repeat(level)}${key}: ${renderObj(value, level + 1)}`;
    })
    .join(",\n");
  return `{\n${inner}\n${"  ".repeat(level - 1)}}`;
};

const renderValue = (value: any, level: number): string => {
  if (Array.isArray(value)) {
    return value.map((v) => renderValue(v, level)).join(" | ");
  } else if (typeof value === "object") {
    return renderObj(value, level + 1);
  } else if (typeof value === "string") {
    return value;
  }
  return `can't render ${value}`;
};

// generate a TypeScript type from a parsed Mustache template
export const genType = (parsed: Mustache[]): string => {
  let obj: Obj = {};

  parsed.forEach((content: Mustache) => {
    if (content.type === "text") {
      return null;
    }
    if (content.type === "variable") {
      obj = mergeObj(obj, nestedObj(content.name));
    }
    if (content.type === "section") {
      const nestedVars = content.content
        .filter((c) => c.type === "variable")
        .map((c) => c.name);
      if (nestedVars.length === 0) {
        obj = mergeObj(obj, nestedObj(content.name));
      }
      nestedVars.forEach((vars) => {
        obj = mergeObj(obj, nestedObj([...content.name, ...vars]));
      });
    }
    if (content.type === "inverted") {
      obj = mergeObj(obj, nestedObj(content.name));
    }
    if (content.type === "comment") {
      return null;
    }
    if (content.type === "partial") {
      return null;
    }
    return null;
  });

  return renderObj(obj);
};
