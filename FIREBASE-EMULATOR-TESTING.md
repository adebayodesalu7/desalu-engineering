# Local Firebase emulator testing

The local website automatically uses Firebase emulators when opened from
`http://localhost:8765` or `http://127.0.0.1:8765`. It uses a `demo-` project ID,
does not initialize App Check, and routes Authentication, Firestore, and Storage
to loopback ports using the synthetic
`demo-desalu-resource-library.appspot.com` bucket name. This mode cannot write
to the configured live Firebase project. Other hosts continue using the regular
Firebase configuration.

## Start the test environment

Requirements: Node.js, npm, Java 17 or newer, and XAMPP/PHP.

In PowerShell, start the emulators from the website folder:

```powershell
Set-Location 'C:\Users\willi\OneDrive\Desktop\Full Stack\11.2+Bootstrap+Components\11.2 Bootstrap Components'
npx --yes firebase-tools@14.22.0 emulators:start --only auth,firestore,storage --project demo-desalu-resource-library
```

The first run downloads the emulator binaries. Leave this terminal open while
testing. Emulator data is temporary unless explicitly exported.

In a second PowerShell window, serve the website:

```powershell
& 'C:\xampp\php\php.exe' -S 127.0.0.1:8765 -t 'C:\Users\willi\OneDrive\Desktop\Full Stack\11.2+Bootstrap+Components\11.2 Bootstrap Components'
```

Open `http://127.0.0.1:8765/auth.html` to create a disposable test account.
Open `http://127.0.0.1:4000` for the Emulator Suite UI, including Authentication,
Firestore, and Storage. The website displays a local-test banner while it is
connected to emulators.

To exercise the staff-only publisher, use an emulator test account with the
custom claim `staff: true`. Never add this claim to a live account from client
code. Keep test ZIPs and data synthetic. The publisher's review checkbox is a
release attestation: do not check it unless its stated package and clean-install
checks were actually completed.

To grant staff access to an existing disposable emulator account, open another
PowerShell window in the website folder and run:

```powershell
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
npx --yes --package=firebase-admin@13.5.0 -- node .\grant-emulator-staff.cjs 'test-account@example.com'
```

The script refuses to run unless the Auth emulator host is explicitly set and
Google application credentials are absent. It targets only the
`demo-desalu-resource-library` project. Sign out and back in after granting the
claim so the website receives a fresh ID token.

## Verify the release flow

1. Confirm the local-test banner is visible on the auth, resource library, and
   publisher pages.
2. Create a regular emulator account and confirm it cannot access staff
   publishing.
3. Grant `staff: true` only to a disposable emulator account with the guarded
   local Admin SDK command above, then confirm the publisher admits that account.
4. After completing the package review required by the publisher's attestation,
   upload a test ZIP through the WordPress, iOS, or web publisher and verify its
   release in the Emulator Suite UI. Do not check the attestation for a synthetic file.
5. For an Android release, upload a test APK or AAB and its separate source ZIP.
   Confirm both files are attached to the same version and that signed-in users
   see separate build and source download buttons.
6. Confirm signed-in users can download published artifacts, and that unsigned
   or non-staff users cannot upload or read private draft artifacts. Each file is
   currently limited to 50 MB.

## Emulator smoke-test results

The local client SDK was used with a clearly labeled 188-byte synthetic ZIP;
the publisher's review attestation was not checked. Firestore draft creation
and publication, Storage upload, catalog display, authenticated download,
SHA-256 verification, and download-history recording all passed. A signed-in
non-staff test account could read the published artifact, but non-staff and
signed-out clients were denied draft reads and uploads. The temporary published
resource, artifact, and download-history entry were removed after verification.
These checks exercise the Firebase client and rules, but do not replace a
separately reviewed upload through the publisher form. No real theme had been
published at the time of this synthetic smoke test; subsequent Supply and Civic
releases are documented below. Live Firebase services were not changed.

Emulator data does not publish to the live library. Live distribution still
requires an approved artifact store, deployed production rules, and a real
release review.

## Techtrix Supply 1.2.3 emulator release

The owner confirmed redistribution rights and approved publishing this theme
as a demo/starter. The release was published through the staff publisher to an
isolated local Firebase emulator stack; the live Firebase project was not
changed. Firestore resource `techtrix-supply-demo` and release
`TYEqgUukYR1bFTYMVUD1` are published, and the ZIP is stored at
`resources/techtrix-supply-demo/releases/TYEqgUukYR1bFTYMVUD1/artifact.zip`.
The library displayed the release and the authenticated download flow verified
the package SHA-256:
`40a730a9733b9282524472f62c28dec087d5ee29360bb0be2f9343e04d3485f1`.

Because the pre-existing Firestore emulator was running without its Auth and
Storage emulator processes, it was left untouched. The release stack uses
Auth on 19099, Firestore on 18080, Storage on 19199, and the Emulator Suite UI
on 4000; the local website copy connected to this stack is served on port
3000. The release emulator data (including its disposable staff-test account)
was exported to
`C:\Users\willi\OneDrive\Documents\plugin\Techtrix-Supply-1.2.3-emulator-export`
and its port/rules configuration was saved to
`C:\Users\willi\OneDrive\Documents\plugin\Techtrix-Supply-1.2.3-emulator-config.json`.
To restore the emulator dataset, run this from the website folder:

```powershell
npx --yes firebase-tools@14.22.0 emulators:start --config 'C:\Users\willi\OneDrive\Documents\plugin\Techtrix-Supply-1.2.3-emulator-config.json' --only auth,firestore,storage --project demo-desalu-resource-library --import 'C:\Users\willi\OneDrive\Documents\plugin\Techtrix-Supply-1.2.3-emulator-export'
```

The demo copy still contains sample shipping/returns claims and must not be
treated as a configured production shop.

## Techtrix Consult Civic Government 1.6.2 emulator release

The owner confirmed redistribution rights for this specific package and
approved an emulator-only upload. The WordPress publisher created resource
`techtrix-civic-government-demo` and release `gTeJ472nXDesRwPNSDbO`, version
1.6.2. The catalog displays the release beside Techtrix Supply; live Firebase
was not changed.

The uploaded archive is
`Techtrix-Consult-Civic-Government-Theme-1.6.2.zip` (204,447 bytes), stored at
`resources/techtrix-civic-government-demo/releases/gTeJ472nXDesRwPNSDbO/artifact.zip`.
Its SHA-256 is
`b2508136c50eb00eb4d628c841e5b3f8b3ec2052ef612fb71e928d0d3f29cfc9`.
The ZIP matched all 55 source files by SHA-256, all 20 PHP files passed PHP
8.5 lint, and Theme Check 20260901 passed 7,198 tests with one informational
text-domain notice. The exact ZIP was installed and activated on the isolated
WordPress test site. Its homepage rendered without browser console errors or
failed requests, and the layout had no horizontal overflow at a 390 px
viewport. The test site was restored afterward to the Supply theme and its
previous WooCommerce coming-soon setting.

The authenticated library download returned 204,447 bytes and its SHA-256
matched the release metadata; the app also recorded the download in user
history. The theme is presentation-only: it does not provide civic post types,
taxonomies, shortcodes, contact forms, or sample content. Replace placeholder
copy/images before use and add separate compatible plugins for structured
civic content or forms. The Civic Companion plugin is not included or
represented as release-ready.

The combined emulator export (including Supply and Civic) is at
`C:\Users\willi\OneDrive\Documents\plugin\Techtrix-Civic-Government-1.6.2-emulator-export`.
Its isolated-stack config is
`C:\Users\willi\OneDrive\Documents\plugin\Techtrix-Civic-Government-1.6.2-emulator-config.json`.
Restore it from the website folder with:

```powershell
npx --yes firebase-tools@14.22.0 emulators:start --config 'C:\Users\willi\OneDrive\Documents\plugin\Techtrix-Civic-Government-1.6.2-emulator-config.json' --only auth,firestore,storage --project demo-desalu-resource-library --import 'C:\Users\willi\OneDrive\Documents\plugin\Techtrix-Civic-Government-1.6.2-emulator-export'
```

## Platform publishing checks

The staff publishing hub provides WordPress, Android, iOS, and HTML/CSS/JS
routes. The browser was checked on all four form routes; Android presents a
build-format selector, one APK/AAB file input, and a separate source ZIP input.
The updated Firestore and Storage rules loaded in an isolated emulator run, and
unauthenticated Firestore writes and Storage uploads were both denied (HTTP
403). No app release was uploaded; the authenticated Android publish-and-
download round trip still needs a reviewed test package and staff test account.
