import { type } from "arktype";

export const isBoolean = type("boolean");
export const isString = type("string");
export const isUndefined = type("undefined");

export const isArrayOfStrings = type("string[]");
export const isReadonlyArrayOfStrings = isArrayOfStrings.readonly();
export const isMaybeReadonlyArrayOfStrings = isReadonlyArrayOfStrings.or(isUndefined);

export const isRecordOfStrings = type("Record<string, string>");
export const isReadonlyRecordOfStrings = isRecordOfStrings.readonly();
