import assert from "node:assert/strict";
import test from "node:test";
import {normalizeInterfacePreferences,preferenceStorageKey,defaultInterfacePreferences} from "../lib/user-interface-preferences";
test("browser preferences are separate for each signed-in identity",()=>{
 assert.notEqual(preferenceStorageKey("emp-1"),preferenceStorageKey("emp-2"));
 assert.equal(preferenceStorageKey("emp-1"),preferenceStorageKey("emp-1"));
});
test("invalid or user-controlled preference values cannot change permission state",()=>{
 assert.deepEqual(normalizeInterfacePreferences({density:"super-admin",reduceMotion:"true",role:"Administrator"}),defaultInterfacePreferences);
 assert.deepEqual(normalizeInterfacePreferences({density:"compact",reduceMotion:true}),{density:"compact",reduceMotion:true});
});
