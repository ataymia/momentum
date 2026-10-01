from pathlib import Path

path = Path("functions/src/index.ts")
text = path.read_text()

replacements = {
'''      json(response, 400, {ok: false, message: "Enter a valid e-mail address."});''': '''      json(response, 400, {
        ok: false,
        message: "Enter a valid e-mail address.",
      });''',
'''    let decoded: Awaited<ReturnType<ReturnType<typeof getAuth>["verifyIdToken"]>>;''': '''    let decoded: Awaited<
      ReturnType<ReturnType<typeof getAuth>["verifyIdToken"]>
    >;''',
'''      json(response, 401, {ok: false, message: "Your session has expired. Sign in again."});''': '''      json(response, 401, {
        ok: false,
        message: "Your session has expired. Sign in again.",
      });''',
'''      const callerAccess = await db.collection(USER_ACCESS).doc(decoded.uid).get();''': '''      const callerAccess = await db
        .collection(USER_ACCESS)
        .doc(decoded.uid)
        .get();''',
'''        json(response, 403, {ok: false, message: "Only an Administrator can change another employee's sign-in e-mail."});''': '''        json(response, 403, {
          ok: false,
          message: "Only an Administrator can change another employee's " +
            "sign-in e-mail.",
        });''',
'''        json(response, 403, {ok: false, message: "This account is not active."});''': '''        json(response, 403, {
          ok: false,
          message: "This account is not active.",
        });''',
'''        const authTime = typeof decoded.auth_time === "number" ? decoded.auth_time : 0;''': '''        const authTime =
          typeof decoded.auth_time === "number" ? decoded.auth_time : 0;''',
'''          json(response, 401, {ok: false, message: "For security, recently sign in again before changing your sign-in e-mail."});''': '''          json(response, 401, {
            ok: false,
            message: "For security, recently sign in again before changing " +
              "your sign-in e-mail.",
          });''',
'''        json(response, 404, {ok: false, message: "That Momentum account could not be found."});''': '''        json(response, 404, {
          ok: false,
          message: "That Momentum account could not be found.",
        });''',
'''        json(response, 409, {ok: false, message: "The Firebase identity has no e-mail address to replace."});''': '''        json(response, 409, {
          ok: false,
          message: "The Firebase identity has no e-mail address to replace.",
        });''',
'''          json(response, 409, {ok: false, message: "That e-mail address already belongs to another Momentum account."});''': '''          json(response, 409, {
            ok: false,
            message: "That e-mail address already belongs to another " +
              "Momentum account.",
          });''',
'''        const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";''': '''        const code =
          typeof error === "object" &&
          error !== null &&
          "code" in error ? String(error.code) : "";''',
'''      const username = normalizeUsername(accessData.username ?? directoryData.username);''': '''      const username = normalizeUsername(
        accessData.username ?? directoryData.username,
      );''',
'''      const history = Array.isArray(accessData.emailChangeHistory) ? accessData.emailChangeHistory.slice(-24) : [];''': '''      const history = Array.isArray(accessData.emailChangeHistory) ?
        accessData.emailChangeHistory.slice(-24) :
        [];''',
'''            const indexedUid = usernameRecord.exists ? textValue(usernameRecord.data()?.uid) : "";''': '''            const indexedUid = usernameRecord.exists ?
              textValue(usernameRecord.data()?.uid) :
              "";''',
'''          transaction.set(directoryRef, {email, updatedAt: at}, {merge: true});''': '''          transaction.set(
            directoryRef,
            {email, updatedAt: at},
            {merge: true},
          );''',
'''          console.error("updateAccountEmail rollback failed", rollbackError);''': '''          console.error(
            "updateAccountEmail rollback failed",
            rollbackError,
          );''',
'''        console.error("updateAccountEmail Firestore coordination failed", error);''': '''        console.error(
          "updateAccountEmail Firestore coordination failed",
          error,
        );''',
'''            "The e-mail change could not be saved. The original sign-in e-mail was restored." :''': '''            "The e-mail change could not be saved. The original sign-in " +
              "e-mail was restored." :''',
'''            "The e-mail change hit a synchronization error. An Administrator must review Firebase Authentication and the employee directory before another change is attempted.",''': '''            "The e-mail change hit a synchronization error. An " +
              "Administrator must review Firebase Authentication and the " +
              "employee directory before another change is attempted.",''',
'''      json(response, 500, {ok: false, message: "The e-mail address could not be changed. Try again."});''': '''      json(response, 500, {
        ok: false,
        message: "The e-mail address could not be changed. Try again.",
      });''',
}

for old, new in replacements.items():
    if old not in text:
        raise SystemExit(f"Missing expected lint anchor: {old}")
    text = text.replace(old, new, 1)

path.write_text(text)

# Protect against another max-len miss in the newly added function before CI.
start = text.index("export const updateAccountEmail = onRequest(")
end = text.index("\nconst stampMeta =", start)
base_line = text[:start].count("\n") + 1
function_lines = text[start:end].splitlines()
violations = [
    (base_line + offset, line)
    for offset, line in enumerate(function_lines)
    if len(line) > 80
]
if violations:
    detail = "\n".join(
        f"{number}: {len(line)} {line}" for number, line in violations
    )
    raise SystemExit(
        f"Account email function still has >80 character lines:\n{detail}"
    )

print(
    "Account email Firebase Function lint cleanup applied with no >80 "
    "character lines."
)
