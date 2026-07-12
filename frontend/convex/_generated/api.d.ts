/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as aiAnswers from "../aiAnswers.js";
import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as notes from "../notes.js";
import type * as policy from "../policy.js";
import type * as qualitative from "../qualitative.js";
import type * as reports from "../reports.js";
import type * as router from "../router.js";
import type * as simulator from "../simulator.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  aiAnswers: typeof aiAnswers;
  auth: typeof auth;
  http: typeof http;
  notes: typeof notes;
  policy: typeof policy;
  qualitative: typeof qualitative;
  reports: typeof reports;
  router: typeof router;
  simulator: typeof simulator;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
