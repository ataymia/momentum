import type {Role} from "./types";
import type {PersistenceMode} from "./persistence";

/** A local prototype can simulate payroll decisions, but must never post live payroll data.
 * This frontend interlock is defense-in-depth, not a substitute for server authorization,
 * provider approval, statutory tax calculations, or completed employee consent. */
export function canMutatePayroll(role:Role|undefined,isDemo:boolean,persistence:PersistenceMode):boolean{
 return role==="Administrator" && isDemo === true && persistence==="local";
}
