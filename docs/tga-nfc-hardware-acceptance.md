# TGA 2026 — NFC Hardware Acceptance Checklist

> **IMPORTANT**: This checklist must be completed with real physical hardware before
> NFC wristbands are considered certified for operational use at TGA 2026.
> No item may be marked complete based on software simulation alone.
>
> Software simulation results (device-less E2E suite) prove the **business logic
> layer** only. Hardware acceptance proves the **physical integration layer**.

---

## Hardware Under Test

| Field | Value |
|---|---|
| Reader model | _To be filled on hardware arrival_ |
| Reader firmware version | _To be filled on hardware arrival_ |
| Reader connection mode | _To be filled on hardware arrival_ |
| Wristband product/spec | _To be filled on hardware arrival_ |
| NFC chip type | _To be filled on hardware arrival_ |
| UID byte length expected | _To be filled on hardware arrival_ |
| Test date | _To be filled on hardware arrival_ |
| Tested by | _To be filled on hardware arrival_ |

---

## STATUS: HARDWARE ACCEPTANCE PENDING

Software simulation is complete. The following capabilities have been proven in
software only and **require physical validation before go-live**:

- Actual reader compatibility with event-day device and browser
- Actual NFC UID byte representation from chosen hardware
- Scan latency under operational load
- Physical NFC read range vs. wristband attachment position
- Printer calibration and label alignment
- Wristband/label durability under event conditions

---

## Section 1 — Reader Connection

### 1.1 Reader connects successfully

- [ ] Reader is recognised by the operating system on event-day device (Windows / iPad / other)
- [ ] No driver installation required, OR driver installation documented and repeatable
- [ ] Reader appears in Device Manager (Windows) or System Information (macOS/iPadOS)

**Notes:**

---

### 1.2 Reader mode confirmed

- [ ] Mode confirmed as: **HID / keyboard-wedge** (preferred) OR Web NFC OR other
- [ ] If keyboard-wedge: tested that UID characters appear in a focused text field
- [ ] If Web NFC: tested that `navigator.nfc` API is available in target browser
- [ ] Mode documented and noted in onboarding runbook

**Confirmed mode:** _________________

**Notes:**

---

## Section 2 — UID Capture & Representation

### 2.1 Actual UID captured

- [ ] Scanned at least one physical wristband and captured its raw UID string
- [ ] Raw UID recorded here: _________________

### 2.2 UID representation compared with normalizeNfcUid()

Paste raw captured string from reader into `normalizeNfcUid()` manually (node REPL
or `npx tsx -e "..."`) and confirm it produces the expected canonical form.

```
Raw from reader:     _________________
normalizeNfcUid():   _________________
Expected canonical:  _________________
Match: YES / NO
```

- [ ] Result matches expected canonical hex (uppercase, no separators)

### 2.3 No byte reversal

Some readers emit UIDs in reversed byte order relative to ISO 14443-3.
Confirm the normalised UID matches what the chip manufacturer documents.

- [ ] Confirmed: UID order matches chip spec (no reversal needed)
- [ ] OR: Byte reversal documented, normalizeNfcUid() updated accordingly before go-live

**Notes:**

---

### 2.4 No truncation or padding

- [ ] UID character count from reader matches chip spec
- [ ] No leading/trailing padding characters injected by reader

**Chip UID length (bytes):** _____  **Reader output length (chars):** _____

---

## Section 3 — Scan Behaviour

### 3.1 Scan + Enter behaviour confirmed

The system expects keyboard-wedge mode: UID characters arrive rapidly followed by Enter.

- [ ] Reader emits Enter (Return / CR) automatically after scan
- [ ] OR: Reader configured to emit Enter — configuration documented
- [ ] Field receives UID text, Enter triggers form submission, focus returns to field

**Enter behaviour:** _________________

---

### 3.2 Twenty consecutive scans tested

- [ ] Scan 20 wristbands back-to-back without delay
- [ ] Each scan produces correct isolated entry (no cross-contamination)
- [ ] No scan lost or merged with adjacent scan

**Result:** _________________

---

### 3.3 Duplicate scan behaviour confirmed

- [ ] Same wristband scanned twice in quick succession
- [ ] Second scan handled gracefully (idempotency or UI message)
- [ ] No duplicate records created in database

**Duplicate handling approach:** _________________

---

## Section 4 — Preparation Flow

### 4.1 Prepare flow tested with real hardware

- [ ] Admin preparation workspace open on event-day device
- [ ] Physical wristband scanned, UID appears in field, Enter pressed
- [ ] WB code generated and displayed (e.g. WB-000001)
- [ ] Record appears in inventory with status = prepared
- [ ] Audit log entry WRISTBAND_PREPARED confirmed in database

**WB code generated:** _________________  **Audit confirmed:** YES / NO

---

## Section 5 — Print & Physical Verification

### 5.1 Print one real band

- [ ] Prepare a wristband (Section 4 above)
- [ ] Open print batch in admin workspace
- [ ] Label printed successfully on event-day printer
- [ ] Label clearly shows WB code in human-readable bold text
- [ ] QR code present on label

**Printer model used:** _________________

---

### 5.2 QR scan tested

- [ ] Scan QR code on printed label with phone camera / QR scanner
- [ ] Decoded value equals exactly the WB code — no URL prefix, no wrapping
- [ ] No PII present in QR payload

**Decoded QR value:** _________________  **Matches WB code:** YES / NO

---

### 5.3 NFC to printed WB verification tested

The physical verification step cross-checks the printed code against the NFC chip.

- [ ] Admin opens verification UI
- [ ] Enter/scan WB code from printed label
- [ ] Scan NFC chip on same wristband, UID received
- [ ] System confirms match: prepared to available transition recorded
- [ ] Mismatch test: WB code of band A + NFC chip of band B — rejected, no status change

**Match result:** _________________  **Mismatch rejection:** YES / NO

---

## Section 6 — Assignment & Check-in

### 6.1 Assignment tested

- [ ] Child with pass reference (KOI-...) ready in database
- [ ] Available wristband assigned to child via volunteer desk
- [ ] status = active confirmed on wristband
- [ ] child_wristband_assignments record created

### 6.2 Volunteer lookup tested (three identifiers)

With the wristband active:

- [ ] Volunteer scans NFC chip — child record found
- [ ] Volunteer enters WB code manually — same child record found
- [ ] Volunteer enters pass reference — same child record found
- [ ] All three identifiers resolve to the same child_event_entry_id

---

## Section 7 — Lost / Replacement

### 7.1 Lost/replacement tested with real bands

- [ ] Active wristband reported lost via admin
- [ ] Old child_wristband_assignments record deactivated
- [ ] Old wristband status = lost
- [ ] Replacement wristband (newly verified) assigned to same child
- [ ] Old NFC UID no longer resolves active child
- [ ] New NFC UID resolves child
- [ ] child_event_entry_id unchanged throughout

---

## Section 8 — Event-day Device & Environment

### 8.1 Reader tested on intended event-day device and browser

- [ ] Tested on: _________________  (device model)
- [ ] Tested in: _________________  (browser name + version)
- [ ] All flows work identically to development environment

### 8.2 Offline / network-failure procedure tested

- [ ] Network disconnected during active scan session
- [ ] Behaviour documented (error message, no silent data loss)
- [ ] Recovery procedure documented

**Offline behaviour:** _________________

---

## Section 9 — Certification Gate

NFC hardware is NOT certified for go-live until ALL items in Sections 1-8 above
are checked off and signed.

| Checkpoint | Status |
|---|---|
| 1.1 Reader connects | PENDING |
| 1.2 Mode confirmed | PENDING |
| 2.1 UID captured | PENDING |
| 2.2 normalizeNfcUid() match | PENDING |
| 2.3 No byte reversal | PENDING |
| 2.4 No truncation/padding | PENDING |
| 3.1 Scan + Enter confirmed | PENDING |
| 3.2 20 consecutive scans | PENDING |
| 3.3 Duplicate scan safe | PENDING |
| 4.1 Prepare flow | PENDING |
| 5.1 Print one real band | PENDING |
| 5.2 QR scan confirmed | PENDING |
| 5.3 NFC / WB verification | PENDING |
| 6.1 Assignment | PENDING |
| 6.2 Volunteer lookup (3 identifiers) | PENDING |
| 7.1 Lost/replacement | PENDING |
| 8.1 Event-day device/browser | PENDING |
| 8.2 Offline procedure | PENDING |

**Certified by:** _________________  **Date:** _________________

---

*Document maintained by: TGA 2026 Operations Engineering*
*Created: 2026-10-01*
*Software simulation reference: tests/test_tga_device_less_e2e.ts*
