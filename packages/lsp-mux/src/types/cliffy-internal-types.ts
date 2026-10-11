// @cliffy/command never re-exports the helper types that appear in inferred
// `Command<...>` generics (e.g. `TypedType`), so declaration emit cannot name
// them (TS2883). Re-exporting them here gives the emitter a nameable path.
export type * from "@cliffy/command/_dist/_argument_types";
export type * from "@cliffy/command/_dist/_type_utils";
