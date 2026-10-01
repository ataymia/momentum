from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Expected patch anchor not found in {path}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# Firebase session: wire secure self-service and Administrator-managed e-mail changes.
replace_once(
    "lib/firebase-session-context.tsx",
    'import { FirebaseAuthSession, currentFirebaseSession, lookupFirebaseAccount, refreshFirebaseSession, requestPasswordResetByUsername, requestUsernameReminder, sendFirebaseEmailVerification, sendFirebasePasswordReset, signInWithFirebasePassword, signInWithUsername, signOutFirebase, updateFirebasePassword } from "./firebase-auth-rest";\n',
    'import { FirebaseAuthSession, currentFirebaseSession, lookupFirebaseAccount, persistFirebaseSession, refreshFirebaseSession, requestPasswordResetByUsername, requestUsernameReminder, sendFirebaseEmailVerification, sendFirebasePasswordReset, signInWithFirebasePassword, signInWithUsername, signOutFirebase, updateFirebasePassword } from "./firebase-auth-rest";\nimport { updateMomentumAccountEmail } from "./firebase-account-management";\n',
)
replace_once(
    "lib/firebase-session-context.tsx",
    '  changePassword:(newPassword:string)=>Promise<ActionResult>;\n',
    '  changePassword:(newPassword:string)=>Promise<ActionResult>;\n  changeOwnEmail:(newEmail:string,currentPassword:string)=>Promise<ActionResult>;\n  /** Administrator-only when uid is another user. Updates Firebase Auth and every Momentum login/profile e-mail reference together. */\n  changeUserEmail:(uid:string,newEmail:string)=>Promise<ActionResult>;\n',
)
replace_once(
    "lib/firebase-session-context.tsx",
    '''  const changePassword=useCallback(async(newPassword:string):Promise<ActionResult>=>{\n    if(!session)return{ok:false,message:"Sign in first."};\n    try{const updated=await updateFirebasePassword(session,newPassword);setSession(updated);return{ok:true};}\n    catch(caught){return{ok:false,message:message(caught,"Password change failed.")};}\n  },[session]);\n\n''',
    '''  const changePassword=useCallback(async(newPassword:string):Promise<ActionResult>=>{\n    if(!session)return{ok:false,message:"Sign in first."};\n    try{const updated=await updateFirebasePassword(session,newPassword);setSession(updated);return{ok:true};}\n    catch(caught){return{ok:false,message:message(caught,"Password change failed.")};}\n  },[session]);\n\n  const changeOwnEmail=useCallback(async(newEmail:string,currentPassword:string):Promise<ActionResult>=>{\n    if(!session||!access)return{ok:false,message:"Sign in first."};\n    const normalizedEmail=newEmail.trim().toLowerCase();\n    if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(normalizedEmail))return{ok:false,message:"Enter a valid e-mail address."};\n    if(normalizedEmail===session.email.toLowerCase())return{ok:false,message:"That is already your sign-in e-mail."};\n    if(!currentPassword)return{ok:false,message:"Enter your current password to change your sign-in e-mail."};\n    try{\n      const fresh=await signInWithFirebasePassword(session.email,currentPassword);\n      if(fresh.uid!==session.uid)return{ok:false,message:"Reauthentication returned a different account. Sign out and try again."};\n      setSession(fresh);\n      const result=await updateMomentumAccountEmail(fresh,session.uid,normalizedEmail);\n      let updated:FirebaseAuthSession;\n      try{updated=await signInWithFirebasePassword(result.email,currentPassword);}\n      catch{updated={...fresh,email:result.email};persistFirebaseSession(updated);}\n      setSession(updated);\n      setEmailVerified(false);\n      await loadWorkspace(updated);\n      const verificationSent=await sendFirebaseEmailVerification(updated).then(()=>true).catch(()=>false);\n      return{ok:true,message:verificationSent?`Sign-in e-mail changed to ${result.email}. A verification e-mail was sent to the new address.`:`Sign-in e-mail changed to ${result.email}. You can send a verification e-mail from your account later.`};\n    }catch(caught){return{ok:false,message:message(caught,"The sign-in e-mail could not be changed.")};}\n  },[access,loadWorkspace,session]);\n\n''',
)
replace_once(
    "lib/firebase-session-context.tsx",
    '''  const setAccountState=useCallback((uid:string,state:AccountAccessState)=>writeAccess(uid,{accountState:state},null),[writeAccess]);\n\n  const updateUserAccess=useCallback((uid:string,patch:UserAccessPatch)=>{\n''',
    '''  const setAccountState=useCallback((uid:string,state:AccountAccessState)=>writeAccess(uid,{accountState:state},null),[writeAccess]);\n\n  const changeUserEmail=useCallback(async(uid:string,newEmail:string):Promise<ActionResult>=>{\n    const denied=requireAdministrator();if(denied)return denied;\n    if(!session)return{ok:false,message:"Sign in first."};\n    const normalizedEmail=newEmail.trim().toLowerCase();\n    if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(normalizedEmail))return{ok:false,message:"Enter a valid e-mail address."};\n    try{\n      const result=await updateMomentumAccountEmail(session,uid,normalizedEmail);\n      if(uid===session.uid){\n        const updated={...session,email:result.email};persistFirebaseSession(updated);setSession(updated);setEmailVerified(false);await loadWorkspace(updated);\n      }else{\n        const current=accessRef.current??access;if(current)await loadDirectory(current);\n      }\n      return{ok:true,message:`Sign-in e-mail changed to ${result.email}.`};\n    }catch(caught){return{ok:false,message:message(caught,"The employee e-mail could not be changed.")};}\n  },[access,loadDirectory,loadWorkspace,requireAdministrator,session]);\n\n  const updateUserAccess=useCallback((uid:string,patch:UserAccessPatch)=>{\n''',
)
replace_once(
    "lib/firebase-session-context.tsx",
    '    signIn,signOut,retry:boot,changePassword,sendPasswordReset,recoverUsername,sendVerificationEmail,refreshVerification,claimAdministrator,createEmployeeAccount,provisioningStatus,deleteEmployeeAccount,setAccountState,updateUserAccess,grantAdministrator,\n',
    '    signIn,signOut,retry:boot,changePassword,changeOwnEmail,changeUserEmail,sendPasswordReset,recoverUsername,sendVerificationEmail,refreshVerification,claimAdministrator,createEmployeeAccount,provisioningStatus,deleteEmployeeAccount,setAccountState,updateUserAccess,grantAdministrator,\n',
)
replace_once(
    "lib/firebase-session-context.tsx",
    '  }),[access,accessRecords,boot,changePassword,claimAdministrator,configuration.configured,configuration.projectId,createEmployeeAccount,deleteEmployeeAccount,directory,emailVerified,error,grantAdministrator,provisioningStatus,recoverUsername,refreshVerification,sendPasswordReset,sendVerificationEmail,session,setAccountState,signIn,signOut,status,updateUserAccess]);\n',
    '  }),[access,accessRecords,boot,changeOwnEmail,changePassword,changeUserEmail,claimAdministrator,configuration.configured,configuration.projectId,createEmployeeAccount,deleteEmployeeAccount,directory,emailVerified,error,grantAdministrator,provisioningStatus,recoverUsername,refreshVerification,sendPasswordReset,sendVerificationEmail,session,setAccountState,signIn,signOut,status,updateUserAccess]);\n',
)

# Global account menu: make e-mail editing obvious and available to every authenticated user.
replace_once(
    "components/app-shell-v4.tsx",
    'import { BadgeDollarSign, BarChart3, Bell, Boxes, Building2, CalendarDays, CheckSquare2, ChevronDown, ChevronRight, CircleDollarSign, CircleHelp, Command, FileText, KeyRound, LayoutDashboard, LogOut, Megaphone, Menu, PanelLeftClose, PanelLeftOpen, PartyPopper, Search, Settings, ShoppingCart, Store, UsersRound, X } from "lucide-react";\n',
    'import { BadgeDollarSign, BarChart3, Bell, Boxes, Building2, CalendarDays, CheckSquare2, ChevronDown, ChevronRight, CircleDollarSign, CircleHelp, Command, FileText, KeyRound, LayoutDashboard, LogOut, Mail, Megaphone, Menu, PanelLeftClose, PanelLeftOpen, PartyPopper, Search, Settings, ShoppingCart, Store, UsersRound, X } from "lucide-react";\n',
)
replace_once(
    "components/app-shell-v4.tsx",
    '  const [passwordOpen,setPasswordOpen]=useState(false); const [newPassword,setNewPassword]=useState(""); const [confirmPassword,setConfirmPassword]=useState(""); const [passwordError,setPasswordError]=useState(""); const [passwordBusy,setPasswordBusy]=useState(false);\n',
    '  const [emailOpen,setEmailOpen]=useState(false); const [newEmail,setNewEmail]=useState(""); const [currentPassword,setCurrentPassword]=useState(""); const [emailError,setEmailError]=useState(""); const [emailMessage,setEmailMessage]=useState(""); const [emailBusy,setEmailBusy]=useState(false);\n  const [passwordOpen,setPasswordOpen]=useState(false); const [newPassword,setNewPassword]=useState(""); const [confirmPassword,setConfirmPassword]=useState(""); const [passwordError,setPasswordError]=useState(""); const [passwordBusy,setPasswordBusy]=useState(false);\n',
)
replace_once(
    "components/app-shell-v4.tsx",
    '  const changePassword=async(event:FormEvent)=>{event.preventDefault();setPasswordError("");if(!firebase){setPasswordError("Firebase Authentication is not connected.");return;}if(newPassword.length<10||!/[a-z]/.test(newPassword)||!/[A-Z]/.test(newPassword)||!/\\d/.test(newPassword)){setPasswordError("Use at least 10 characters with upper-case, lower-case, and a digit.");return;}if(newPassword!==confirmPassword){setPasswordError("The two passwords do not match.");return;}setPasswordBusy(true);const result=await firebase.changePassword(newPassword);setPasswordBusy(false);if(!result.ok){setPasswordError(result.message??"Password change failed.");return;}setPasswordOpen(false);setNewPassword("");setConfirmPassword("");};\n',
    '  const changeEmail=async(event:FormEvent)=>{event.preventDefault();setEmailError("");setEmailMessage("");if(!firebase){setEmailError("Firebase Authentication is not connected.");return;}const normalized=newEmail.trim().toLowerCase();if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(normalized)){setEmailError("Enter a valid e-mail address.");return;}if(normalized===currentUser.email.toLowerCase()){setEmailError("That is already your sign-in e-mail.");return;}if(!currentPassword){setEmailError("Enter your current password.");return;}setEmailBusy(true);const result=await firebase.changeOwnEmail(newEmail,currentPassword);setEmailBusy(false);if(!result.ok){setEmailError(result.message??"E-mail change failed.");return;}setEmailMessage(result.message??"Sign-in e-mail updated.");setCurrentPassword("");setNewEmail(normalized);};\n  const changePassword=async(event:FormEvent)=>{event.preventDefault();setPasswordError("");if(!firebase){setPasswordError("Firebase Authentication is not connected.");return;}if(newPassword.length<10||!/[a-z]/.test(newPassword)||!/[A-Z]/.test(newPassword)||!/\\d/.test(newPassword)){setPasswordError("Use at least 10 characters with upper-case, lower-case, and a digit.");return;}if(newPassword!==confirmPassword){setPasswordError("The two passwords do not match.");return;}setPasswordBusy(true);const result=await firebase.changePassword(newPassword);setPasswordBusy(false);if(!result.ok){setPasswordError(result.message??"Password change failed.");return;}setPasswordOpen(false);setNewPassword("");setConfirmPassword("");};\n',
)
replace_once(
    "components/app-shell-v4.tsx",
    '{firebase&&<button onClick={()=>{setUserOpen(false);setPasswordOpen(true)}}><KeyRound size={16}/><span><strong>Change password</strong><small>Update your own sign-in password</small></span></button>}',
    '{firebase&&<button onClick={()=>{setUserOpen(false);setEmailOpen(true);setNewEmail(currentUser.email);setCurrentPassword("");setEmailError("");setEmailMessage("")}}><Mail size={16}/><span><strong>Change email</strong><small>Update your own sign-in email</small></span></button>}{firebase&&<button onClick={()=>{setUserOpen(false);setPasswordOpen(true)}}><KeyRound size={16}/><span><strong>Change password</strong><small>Update your own sign-in password</small></span></button>}',
)
replace_once(
    "components/app-shell-v4.tsx",
    '<Modal open={passwordOpen} title="Change password" description="Update your own Firebase Authentication password. Momentum never stores it."',
    '<Modal open={emailOpen} title="Change email" description="Update your own sign-in email. Your username stays the same." onClose={()=>{setEmailOpen(false);setEmailError("");setEmailMessage("");setCurrentPassword("")}} footer={<><Button variant="ghost" onClick={()=>setEmailOpen(false)}>Close</Button><Button type="submit" form="self-email-form" disabled={emailBusy}>Save email</Button></>}><form id="self-email-form" className="access-gate-form" onSubmit={changeEmail}><label><span>Current sign-in email</span><input type="email" value={currentUser.email} readOnly/></label><label><span>New email</span><input type="email" required autoComplete="email" value={newEmail} onChange={(event)=>setNewEmail(event.target.value)}/></label><label><span>Current password</span><input type="password" required autoComplete="current-password" value={currentPassword} onChange={(event)=>setCurrentPassword(event.target.value)}/></label>{emailError&&<p className="form-error" role="alert">{emailError}</p>}{emailMessage&&<p className="form-notice" role="status">{emailMessage}</p>}</form></Modal><Modal open={passwordOpen} title="Change password" description="Update your own Firebase Authentication password. Momentum never stores it."',
)

# Employee directory: Administrator can change the work/login e-mail for any employee.
replace_once(
    "components/hcm/employee-directory.tsx",
    '    const title = String(form.get("title") ?? "").trim() || selected.title;\n    const phone = String(form.get("phone") ?? "").trim();\n',
    '    const title = String(form.get("title") ?? "").trim() || selected.title;\n    const email = String(form.get("email") ?? "").trim().toLowerCase();\n    const phone = String(form.get("phone") ?? "").trim();\n',
)
replace_once(
    "components/hcm/employee-directory.tsx",
    '    const accessResult = await firebase.updateUserAccess(selected.id, { title, phone, managerId });\n    if (!accessResult.ok) {\n      setEditMessage(accessResult.message ?? "Employee access profile could not be updated.");\n      return;\n    }\n\n',
    '    const emailChanged = email !== selected.email.toLowerCase();\n    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {\n      setEditMessage("Enter a valid work e-mail address.");\n      return;\n    }\n    if (emailChanged) {\n      const emailResult = await firebase.changeUserEmail(selected.id,email);\n      if (!emailResult.ok) {\n        setEditMessage(emailResult.message ?? "Employee sign-in e-mail could not be updated.");\n        return;\n      }\n    }\n\n    const accessResult = await firebase.updateUserAccess(selected.id, { title, phone, managerId });\n    if (!accessResult.ok) {\n      setEditMessage(emailChanged ? `Work e-mail changed, but other profile fields could not be saved: ${accessResult.message ?? "update failed"}` : accessResult.message ?? "Employee access profile could not be updated.");\n      return;\n    }\n\n',
)
replace_once(
    "components/hcm/employee-directory.tsx",
    '      setEditMessage("Employee profile updated.");\n',
    '      setEditMessage(emailChanged ? "Employee profile and sign-in e-mail updated." : "Employee profile updated.");\n',
)
replace_once(
    "components/hcm/employee-directory.tsx",
    '        {adminPrivate && firebase && <Section title="Edit employee profile" description="Administrators can maintain the employee\'s operational profile. Role and account-state controls remain in Administration.">\n',
    '        {adminPrivate && firebase && <Section title="Edit employee profile" description="Administrators can maintain the employee\'s operational profile, including the work e-mail used to sign in. Role and account-state controls remain in Administration.">\n',
)
replace_once(
    "components/hcm/employee-directory.tsx",
    '            <Field label="Job title"><input name="title" defaultValue={employment?.jobTitle ?? selected.title}/></Field>\n            <Field label="Work phone"><input name="phone" defaultValue={selected.phone ?? ""} placeholder="602-555-0000"/></Field>\n',
    '            <Field label="Job title"><input name="title" defaultValue={employment?.jobTitle ?? selected.title}/></Field>\n            <Field label="Work email"><input name="email" type="email" required defaultValue={selected.email}/></Field>\n            <Field label="Work phone"><input name="phone" defaultValue={selected.phone ?? ""} placeholder="602-555-0000"/></Field>\n',
)

# Firebase Functions: privileged, auditable identity e-mail update with rollback if Firestore coordination fails.
functions_anchor = '''const stampMeta = async (keys: string[]) => {\n'''
functions_insert = r'''export const updateAccountEmail = onRequest(
  {
    cors: true,
    region: "us-central1",
  },
  async (request, response) => {
    if (request.method !== "POST") {
      json(response, 405, {ok: false, message: "Method not allowed."});
      return;
    }

    const authorization = request.headers.authorization ?? "";
    const token = authorization.startsWith("Bearer ") ?
      authorization.slice("Bearer ".length).trim() :
      "";

    if (!token) {
      json(response, 401, {ok: false, message: "Sign in first."});
      return;
    }

    const uid = textValue(request.body?.uid);
    const email = textValue(request.body?.email).toLowerCase();
    if (!uid || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      json(response, 400, {ok: false, message: "Enter a valid e-mail address."});
      return;
    }

    let decoded: Awaited<ReturnType<ReturnType<typeof getAuth>["verifyIdToken"]>>;
    try {
      decoded = await getAuth().verifyIdToken(token);
    } catch {
      json(response, 401, {ok: false, message: "Your session has expired. Sign in again."});
      return;
    }

    try {
      const callerAccess = await db.collection(USER_ACCESS).doc(decoded.uid).get();
      const callerData = callerAccess.data() ?? {};
      const callerIsAdministrator = callerAccess.exists &&
        callerData.role === "Administrator" &&
        callerData.accountState === "Active";
      const selfChange = decoded.uid === uid;

      if (!selfChange && !callerIsAdministrator) {
        json(response, 403, {ok: false, message: "Only an Administrator can change another employee's sign-in e-mail."});
        return;
      }
      if (selfChange && callerData.accountState !== "Active") {
        json(response, 403, {ok: false, message: "This account is not active."});
        return;
      }
      if (selfChange && !callerIsAdministrator) {
        const authTime = typeof decoded.auth_time === "number" ? decoded.auth_time : 0;
        const ageSeconds = Math.floor(Date.now() / 1000) - authTime;
        if (!authTime || ageSeconds > 10 * 60) {
          json(response, 401, {ok: false, message: "For security, recently sign in again before changing your sign-in e-mail."});
          return;
        }
      }

      const accessRef = db.collection(USER_ACCESS).doc(uid);
      const directoryRef = db.collection(EMPLOYEE_DIRECTORY).doc(uid);
      const [targetAuth, targetAccess, targetDirectory] = await Promise.all([
        getAuth().getUser(uid),
        accessRef.get(),
        directoryRef.get(),
      ]);
      if (!targetAccess.exists || !targetDirectory.exists) {
        json(response, 404, {ok: false, message: "That Momentum account could not be found."});
        return;
      }

      const previousEmail = textValue(targetAuth.email).toLowerCase();
      if (!previousEmail) {
        json(response, 409, {ok: false, message: "The Firebase identity has no e-mail address to replace."});
        return;
      }
      if (previousEmail === email) {
        json(response, 200, {ok: true, uid, email, previousEmail});
        return;
      }

      try {
        const duplicate = await getAuth().getUserByEmail(email);
        if (duplicate.uid !== uid) {
          json(response, 409, {ok: false, message: "That e-mail address already belongs to another Momentum account."});
          return;
        }
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
        if (code !== "auth/user-not-found") throw error;
      }

      const accessData = targetAccess.data() ?? {};
      const directoryData = targetDirectory.data() ?? {};
      const username = normalizeUsername(accessData.username ?? directoryData.username);
      const history = Array.isArray(accessData.emailChangeHistory) ? accessData.emailChangeHistory.slice(-24) : [];
      const at = new Date().toISOString();
      const changeEvent = {
        previousEmail,
        email,
        changedAt: at,
        changedBy: decoded.uid,
        source: selfChange ? "Self-service" : "Administrator",
      };

      await getAuth().updateUser(uid, {
        email,
        emailVerified: false,
      });

      try {
        await db.runTransaction(async (transaction) => {
          let usernameRef = null;
          if (username) {
            usernameRef = db.collection("usernames").doc(username);
            const usernameRecord = await transaction.get(usernameRef);
            const indexedUid = usernameRecord.exists ? textValue(usernameRecord.data()?.uid) : "";
            if (indexedUid && indexedUid !== uid) {
              throw new Error("MOMENTUM_USERNAME_INDEX_COLLISION");
            }
          }

          transaction.set(accessRef, {
            email,
            emailChangedAt: at,
            emailChangedBy: decoded.uid,
            emailChangeHistory: [...history, changeEvent],
            updatedAt: at,
            updatedBy: decoded.uid,
          }, {merge: true});
          transaction.set(directoryRef, {email, updatedAt: at}, {merge: true});
          if (usernameRef) {
            transaction.set(usernameRef, {
              uid,
              email,
              updatedAt: at,
              updatedBy: decoded.uid,
            }, {merge: true});
          }
        });
      } catch (error) {
        let rollbackSucceeded = true;
        try {
          await getAuth().updateUser(uid, {
            email: previousEmail,
            emailVerified: targetAuth.emailVerified,
          });
        } catch (rollbackError) {
          rollbackSucceeded = false;
          console.error("updateAccountEmail rollback failed", rollbackError);
        }
        console.error("updateAccountEmail Firestore coordination failed", error);
        json(response, 502, {
          ok: false,
          message: rollbackSucceeded ?
            "The e-mail change could not be saved. The original sign-in e-mail was restored." :
            "The e-mail change hit a synchronization error. An Administrator must review Firebase Authentication and the employee directory before another change is attempted.",
        });
        return;
      }

      await stampMeta(["employeeDirectory"]);
      json(response, 200, {ok: true, uid, email, previousEmail});
    } catch (error) {
      console.error("updateAccountEmail failed", error);
      json(response, 500, {ok: false, message: "The e-mail address could not be changed. Try again."});
    }
  },
);

'''
replace_once("functions/src/index.ts", functions_anchor, functions_insert + functions_anchor)

# Add the regression file to the normal full logic suite.
replace_once(
    "package.json",
    'tests/firebase-auth-routing.test.ts tests/delivery-driver.test.ts',
    'tests/firebase-auth-routing.test.ts tests/account-email-management.test.ts tests/delivery-driver.test.ts',
)

print("Account e-mail management patch applied.")
