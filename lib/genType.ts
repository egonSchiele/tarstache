import { Mustache, VariableTag } from "./types";

const uniq = <T>(arr: T[]): T[] => Array.from(new Set(arr));
const OPTIONAL = "__OPTIONAL__";
const DEFAULT_TYPE = "__DEFAULT_TYPE__";
type Obj = any;

const notAKey = (key: string): boolean => {
  return typeof key !== "string" || parseInt(key) >= 0;
};

/* 
given an array of keys like

["user", "emails", "address"]

this will return an object like

{ user: { emails: { address: ["string"] } } }

optional: if true, the last key will be prefixed with OPTIONAL
typeToSet: if provided, this will be the type set at the last key

*/
export const nestedObj = (
  keys: string[],
  optional: boolean = false,
  typeToSet: string[] = [DEFAULT_TYPE]
): Obj => {
  const obj: Obj = {};
  if (keys.length === 0) {
    return obj;
  }
  const key = keys.length === 1 && optional ? `${OPTIONAL}${keys[0]}` : keys[0];
  if (notAKey(key)) {
    throw new Error(`key is not a string: ${key}`);
  }

  if (!obj[key]) {
    obj[key] =
      keys.length === 1
        ? [...typeToSet]
        : nestedObj(keys.slice(1), optional, typeToSet);
  } else if (Array.isArray(obj[key])) {
    if (keys.length === 1) {
      if (typeToSet[0] === DEFAULT_TYPE && typeToSet.length === 1) {
        // default type, so ignore
      } else {
        // we have a type conflict
        throw new Error(
          `${key} was previously set to ${obj[key]} and is now being set to ${typeToSet}`
        );
      }
      //obj[key] = uniq([...obj[key], ...typeToSet]);
    } else {
      obj[key] = uniq([
        ...obj[key],
        nestedObj(keys.slice(1), optional, typeToSet),
      ]);
    }
  } else if (typeof obj[key] === "object") {
    obj[key] = nestedObj(keys.slice(1), optional, typeToSet);
  }
  return obj;
};

const getKeys = (obj: Record<any, any> | any[]): string[] => {
  if (Array.isArray(obj)) {
    return [];
  }
  if (typeof obj === "object") {
    return [...Object.keys(obj)];
  }
  return [];
};

/*
smartly merge two objects generated by nestedObj together
*/
export const mergeObj = (obj1: Obj, obj2: Obj): Obj => {
  if (Array.isArray(obj1) || Array.isArray(obj2)) {
    const newArr = uniq([obj1, obj2].flat()).filter((v) => v !== DEFAULT_TYPE);
    if (newArr.length === 1) {
      return newArr;
    }
    if (newArr.length === 0) {
      return [DEFAULT_TYPE];
    }
    throw new Error(
      `can't merge ${JSON.stringify(obj1)} and ${JSON.stringify(
        obj2
      )}, the types conflict`
    );
  }

  const keys = uniq([getKeys(obj1), getKeys(obj2)].flat());
  const newObj: Obj = {};
  keys.forEach((key) => {
    if (notAKey(key)) {
      throw new Error(`key is not a string: ${key}`);
    }

    if (typeof obj1[key] === "object" && typeof obj2[key] === "object") {
      newObj[key] = mergeObj(obj1[key] as Obj, obj2[key] as Obj);
    } else if (obj1[key] === undefined) {
      newObj[key] = obj2[key];
    } else if (obj2[key] === undefined) {
      newObj[key] = obj1[key];
    } else {
      throw new Error(
        `can't merge ${JSON.stringify(obj1[key])} and ${JSON.stringify(
          obj2[key]
        )}`
      );
    }
  });
  return newObj;
};

// render a single object to a TypeScript type
export const renderObj = (obj: Obj, level: number = 1): string => {
  if (typeof obj === "string") {
    return obj;
  }
  const inner = Object.entries(obj)
    .map(([_key, value]) => {
      let key = _key;
      let optStr = "";
      let arrayStr = "";
      if (key.startsWith(OPTIONAL)) {
        const newkey = key.replace(OPTIONAL, "");
        if (obj[newkey]) {
          // a required version of this key already exists
          // so skip the optional version
          return "";
        }
        key = newkey;
        optStr = "?";
      }
      if (key.endsWith("[]")) {
        key = key.replace("[]", "");
        arrayStr = "[]";
      }
      if (Array.isArray(value)) {
        return `${"  ".repeat(level)}${key}${optStr}: ${renderValue(
          value,
          level
        )}${arrayStr};`;
      }
      return `${"  ".repeat(level)}${key}${optStr}: ${renderObj(
        value,
        level + 1
      )}${arrayStr};`;
    })
    .filter((v) => v !== "")
    .join("\n");
  return `{\n${inner}\n${"  ".repeat(level - 1)}}`;
};

const renderValue = (value: any, level: number): string => {
  if (value === DEFAULT_TYPE) {
    return renderValue(["string", "boolean", "number"], level);
  }
  if (Array.isArray(value)) {
    return uniq(value)
      .map((v) => renderValue(v, level))
      .join(" | ");
  } else if (typeof value === "object") {
    return renderObj(value, level + 1);
  } else if (typeof value === "string") {
    return value;
  }
  return `can't render ${value}`;
};

const deepSet = (obj: Obj, keys: string[], value: any): void => {
  let current = obj;
  keys.forEach((key, i) => {
    if (notAKey(key)) {
      throw new Error(`key is not a string: ${key}`);
    }
    if (i === keys.length - 1) {
      if (value === OPTIONAL) {
        const optionalKey = `${OPTIONAL}${key}`;
        if (optionalKey in current) {
          // already set as optional
          return;
        }
        current[optionalKey] = current[key];
        delete current[key];
      } else if (Array.isArray(current[key])) {
        current[key] = uniq([...current[key], value]);
      } else if (typeof current[key] === "object") {
        current[key] = [current[key], value];
      } else {
        current[key] = value;
      }
    } else {
      if (!current[key]) {
        current[key] = {};
      }
      if (Array.isArray(current[key])) {
        current[key].forEach((v: any) => {
          deepSet(v, keys.slice(i + 1), value);
        });
      } else if (typeof current[key] === "object") {
        current = current[key];
      }
    }
  });
};

// generate a TypeScript type from a parsed Mustache template
export const genType = (parsed: Mustache[]): string => {
  let obj: Obj = {};

  parsed.forEach((content: Mustache) => {
    if (content.type === "text") {
      return null;
    }
    if (content.type === "variable") {
      obj = mergeObj(
        obj,
        nestedObj(
          content.name,
          content.varType?.optional || false,
          content.varType?.name || undefined
        )
      );
    }
    if (content.type === "section") {
      const nestedVars = content.content.filter((c) => c.type === "variable");
      const allGlobals = nestedVars.every((v) => v.scope === "global");
      // no local vars, therefore boolean,
      // also check if optional
      if (nestedVars.length === 0 || allGlobals) {
        obj = mergeObj(
          obj,
          nestedObj(
            content.name,
            content.varType?.optional,
            content.varType?.name || ["boolean"]
          )
        );
      }

      nestedVars.forEach((variable: VariableTag) => {
        if (variable.scope === "global") {
          /* If this is explicitly set as global, all we need to do
          is set it on the object and we can return. */
          obj = mergeObj(
            obj,
            nestedObj(
              [...variable.name],
              variable.varType?.optional || false,
              variable.varType?.name || undefined
            )
          );
          return;
        } else if (variable.scope === "local") {
          obj = mergeObj(
            obj,
            nestedObj(
              [...content.name, ...variable.name],
              variable.varType?.optional || false,
              variable.varType?.name || undefined
            )
          );
          return;
        }
      });
      // is this optional?
      // This, unfortunately, has to come after we have processed all the nested variables
      if (content.varType?.optional) {
        deepSet(obj, content.name, OPTIONAL);
      }
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
