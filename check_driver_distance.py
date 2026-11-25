import os
import sys
import argparse
import datetime
from dotenv import load_dotenv
from pymongo import MongoClient
import pandas as pd

load_dotenv()

# Set stdout/stderr encoding to utf-8 on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/nismara_db")

MONTH_NAMES = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
]

def parse_args():
    parser = argparse.ArgumentParser(description="Bulk check jarak tempuh bulanan driverlink & status cuti users")
    parser.add_argument("--month", type=int, default=7, help="Bulan audit (1-12, default: 7)")
    parser.add_argument("--year", type=int, default=2026, help="Tahun audit (default: 2026)")
    parser.add_argument("--min_km", type=float, default=2500.0, help="Minimum jarak tempuh KM (default: 2500)")
    parser.add_argument("--guild_id", type=str, default=None, help="Filter guild ID tertentu (opsional)")
    parser.add_argument("--start_date", type=str, default=None, help="Tanggal awal custom YYYY-MM-DD (opsional)")
    parser.add_argument("--end_date", type=str, default=None, help="Tanggal akhir custom YYYY-MM-DD (opsional)")
    parser.add_argument("--export_csv", type=str, default=None, help="Path output file CSV")
    parser.add_argument("--export_json", type=str, default=None, help="Path output file JSON")
    parser.add_argument("--export_md", type=str, default=None, help="Path output file Markdown")
    parser.add_argument("--show_all", action="store_true", help="Tampilkan semua driver termasuk yang lolos di terminal")
    return parser.parse_args()

def run_driver_audit(month=10, year=2026, min_km=2500.0, guild_id=None, start_date=None, end_date=None):
    client = MongoClient(MONGODB_URI)
    db = client.get_default_database()

    # Hitung batas tanggal
    if start_date and end_date:
        start_dt = datetime.datetime.fromisoformat(start_date)
        end_dt = datetime.datetime.fromisoformat(end_date)
    else:
        start_dt = datetime.datetime(year, month, 1, 0, 0, 0, tzinfo=datetime.timezone.utc)
        if month == 12:
            next_month_start = datetime.datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=datetime.timezone.utc)
        else:
            next_month_start = datetime.datetime(year, month + 1, 1, 0, 0, 0, tzinfo=datetime.timezone.utc)
        end_dt = next_month_start - datetime.timedelta(microseconds=1)

    month_name = MONTH_NAMES[month - 1] if 1 <= month <= 12 else f"Bulan {month}"

    # 1. Fetch all driver links
    driver_filter = {}
    if guild_id:
        driver_filter["guildId"] = guild_id
    driverlinks = list(db["driverlinks"].find(driver_filter))

    # 2. Fetch all users
    users = list(db["users"].find({}))
    user_by_discord = {str(u.get("discordId")): u for u in users if u.get("discordId")}
    user_by_trucky = {str(u.get("truckyId")): u for u in users if u.get("truckyId") is not None}

    # 3. Aggregate Job Histories
    job_pipeline = [
        {
            "$match": {
                "jobStatus": "COMPLETED",
                "createdAt": {
                    "$gte": start_dt,
                    "$lte": end_dt
                }
            }
        },
        {
            "$group": {
                "_id": {
                    "driverId": "$driverId",
                    "truckyId": "$truckyId"
                },
                "totalKm": {"$sum": {"$ifNull": ["$distanceKm", 0]}},
                "jobCount": {"$sum": 1}
            }
        }
    ]
    job_aggr = list(db["jobhistories"].aggregate(job_pipeline))

    mileage_by_driver = {}
    mileage_by_trucky = {}

    for item in job_aggr:
        d_id = str(item["_id"].get("driverId")) if item["_id"].get("driverId") else None
        t_id = str(item["_id"].get("truckyId")) if item["_id"].get("truckyId") else None
        km = item.get("totalKm", 0)
        cnt = item.get("jobCount", 0)

        if d_id:
            curr = mileage_by_driver.get(d_id, {"totalKm": 0, "jobCount": 0})
            mileage_by_driver[d_id] = {"totalKm": curr["totalKm"] + km, "jobCount": curr["jobCount"] + cnt}
        if t_id:
            curr = mileage_by_trucky.get(t_id, {"totalKm": 0, "jobCount": 0})
            mileage_by_trucky[t_id] = {"totalKm": curr["totalKm"] + km, "jobCount": curr["jobCount"] + cnt}

    # 4. Process each driverlink
    results = []
    for dl in driverlinks:
        user_id_str = str(dl.get("userId", ""))
        trucky_id_str = str(dl.get("truckyId", ""))

        user_doc = user_by_discord.get(user_id_str) or user_by_trucky.get(trucky_id_str)
        has_user_doc = user_doc is not None
        is_on_leave = user_doc.get("isOnLeave", False) if user_doc else False
        user_name = (user_doc.get("name") if user_doc else None) or dl.get("truckyName") or "Unknown"

        # Matching KM
        total_km = 0
        job_count = 0
        if user_id_str in mileage_by_driver:
            stat = mileage_by_driver[user_id_str]
            total_km = stat["totalKm"]
            job_count = stat["jobCount"]
        elif trucky_id_str in mileage_by_trucky:
            stat = mileage_by_trucky[trucky_id_str]
            total_km = stat["totalKm"]
            job_count = stat["jobCount"]

        # Classification
        if total_km >= min_km:
            status = "PASSED" if has_user_doc else "MISSING_USER_PASSED"
        else:
            if not has_user_doc:
                status = "MISSING_USER_FAILED"
            elif is_on_leave:
                status = "FAILED_ON_LEAVE"
            else:
                status = "FAILED_ACTIVE"

        results.append({
            "userId": user_id_str,
            "truckyId": dl.get("truckyId"),
            "truckyName": dl.get("truckyName", ""),
            "userName": user_name,
            "hasUserDoc": has_user_doc,
            "isOnLeave": is_on_leave,
            "totalKm": round(total_km, 2),
            "jobCount": job_count,
            "status": status,
            "guildId": dl.get("guildId")
        })

    results.sort(key=lambda x: x["totalKm"])
    client.close()

    return {
        "period": {
            "month": month,
            "monthName": month_name,
            "year": year,
            "startDate": start_dt.isoformat(),
            "endDate": end_dt.isoformat()
        },
        "minKm": min_km,
        "results": results
    }

def main():
    args = parse_args()
    audit_data = run_driver_audit(
        month=args.month,
        year=args.year,
        min_km=args.min_km,
        guild_id=args.guild_id,
        start_date=args.start_date,
        end_date=args.end_date
    )

    results = audit_data["results"]
    period = audit_data["period"]
    min_km = audit_data["minKm"]

    passed = [r for r in results if "PASSED" in r["status"]]
    failed_active = [r for r in results if r["status"] == "FAILED_ACTIVE"]
    failed_on_leave = [r for r in results if r["status"] == "FAILED_ON_LEAVE"]
    missing_user = [r for r in results if not r["hasUserDoc"]]

    total_drivers = len(results)
    total_km = sum(r["totalKm"] for r in results)
    total_jobs = sum(r["jobCount"] for r in results)
    avg_km = round(total_km / total_drivers) if total_drivers > 0 else 0

    print("\n" + "="*70)
    print(f"📊 RINGKASAN AUDIT BULANAN: {period['monthName']} {period['year']}")
    print("="*70)
    print(f"👥 Total Driverlink Terdaftar  : {total_drivers} driver")
    print(f"✅ Mencapai Target (>= {min_km:,.0f} KM) : {len(passed)} driver ({(len(passed)/total_drivers*100):.1f}%)")
    print(f"❌ Tidak Capai & Aktif (Wajib Review) : {len(failed_active)} driver ({(len(failed_active)/total_drivers*100):.1f}%)")
    print(f"🏖️ Tidak Capai & Sedang Cuti (Izin)  : {len(failed_on_leave)} driver ({(len(failed_on_leave)/total_drivers*100):.1f}%)")
    print(f"⚠️ Driver Tanpa Record di Users DB   : {len(missing_user)} driver")
    print(f"🛣️ Total Jarak Tempuh Seluruh Armada : {total_km:,.0f} KM ({total_jobs:,} Pengiriman)")
    print(f"📈 Rata-rata Jarak Tempuh per Driver : {avg_km:,.0f} KM")
    print("="*70 + "\n")

    # Table 1: Failed Active
    print(f"\n🚨 [DAFTAR 1] DRIVER TIDAK MENCAPAI {min_km:,.0f} KM (STATUS: AKTIF / TIDAK CUTI)")
    print("-" * 120)
    print(f"| {'No':<2} | {'Trucky Name':<20} | {'Trucky ID':<9} | {'Discord ID':<19} | {'Nama Web / User':<20} | {'Total KM':>10} | {'Jobs':>4} | {'Selisih KM':>12} |")
    print("-" * 120)
    if not failed_active:
        print("| 🎉 Semua driver aktif berhasil mencapai minimum jarak tempuh!")
    else:
        for idx, r in enumerate(failed_active, start=1):
            shortage = min_km - r['totalKm']
            print(f"| {idx:<2} | {r['truckyName'][:20]:<20} | {str(r['truckyId'])[:9]:<9} | {str(r['userId'])[:19]:<19} | {r['userName'][:20]:<20} | {r['totalKm']:>10,.1f} | {r['jobCount']:>4} | {f'-{shortage:,.1f} KM':>12} |")
    print("-" * 120 + "\n")

    # Table 2: Failed on Leave
    print(f"\n🏖️ [DAFTAR 2] DRIVER TIDAK MENCAPAI {min_km:,.0f} KM (STATUS: SEDANG CUTI [isOnLeave: true])")
    print("-" * 120)
    print(f"| {'No':<2} | {'Trucky Name':<20} | {'Trucky ID':<9} | {'Discord ID':<19} | {'Nama Web / User':<20} | {'Total KM':>10} | {'Jobs':>4} | {'Cuti?':^7} |")
    print("-" * 120)
    if not failed_on_leave:
        print("| Tidak ada driver cuti yang di bawah target.")
    else:
        for idx, r in enumerate(failed_on_leave, start=1):
            print(f"| {idx:<2} | {r['truckyName'][:20]:<20} | {str(r['truckyId'])[:9]:<9} | {str(r['userId'])[:19]:<19} | {r['userName'][:20]:<20} | {r['totalKm']:>10,.1f} | {r['jobCount']:>4} | {'YES':^7} |")
    print("-" * 120 + "\n")

    # Table 3: Missing in Users DB
    if missing_user:
        print(f"\n⚠️ [DAFTAR 3] DRIVERLINK TANPA DATA DI KOLEKSI 'USERS' (Belum Terdaftar / Link Discord Belum Match)")
        print("-" * 105)
        print(f"| {'No':<2} | {'Trucky Name':<20} | {'Trucky ID':<9} | {'Discord ID':<19} | {'Total KM':>10} | {'Jobs':>4} | {'Status Target':^15} |")
        print("-" * 105)
        for idx, r in enumerate(missing_user, start=1):
            status_lbl = "✅ Lolos" if r['totalKm'] >= min_km else "❌ Kurang"
            print(f"| {idx:<2} | {r['truckyName'][:20]:<20} | {str(r['truckyId'])[:9]:<9} | {str(r['userId'])[:19]:<19} | {r['totalKm']:>10,.1f} | {r['jobCount']:>4} | {status_lbl:^15} |")
        print("-" * 105 + "\n")

    # Optional Table 4: Passed
    if args.show_all:
        print(f"\n✅ [DAFTAR 4] DRIVER MEMENUHI TARGET (>= {min_km:,.0f} KM)")
        print("-" * 105)
        print(f"| {'No':<2} | {'Trucky Name':<20} | {'Trucky ID':<9} | {'Discord ID':<19} | {'Nama Web / User':<20} | {'Total KM':>10} | {'Jobs':>4} |")
        print("-" * 105)
        for idx, r in enumerate(passed, start=1):
            print(f"| {idx:<2} | {r['truckyName'][:20]:<20} | {str(r['truckyId'])[:9]:<9} | {str(r['userId'])[:19]:<19} | {r['userName'][:20]:<20} | {r['totalKm']:>10,.1f} | {r['jobCount']:>4} |")
        print("-" * 105 + "\n")

    # Auto-create subfolder report/YYYY-MM/
    report_dir = os.path.join("report", f"{period['year']}-{int(period['month']):02d}")
    os.makedirs(report_dir, exist_ok=True)

    # Exports
    if args.export_csv:
        csv_path = args.export_csv if os.path.isabs(args.export_csv) or os.path.dirname(args.export_csv) else os.path.join(report_dir, args.export_csv)
        os.makedirs(os.path.dirname(csv_path) or ".", exist_ok=True)
        df = pd.DataFrame(results)
        df.to_csv(csv_path, index=False, encoding="utf-8-sig")
        print(f"📊 Export CSV berhasil disimpan ke: {csv_path}")

    if args.export_json:
        import json
        json_path = args.export_json if os.path.isabs(args.export_json) or os.path.dirname(args.export_json) else os.path.join(report_dir, args.export_json)
        os.makedirs(os.path.dirname(json_path) or ".", exist_ok=True)
        with open(json_path, "w", encoding="utf-8") as jf:
            json.dump(audit_data, jf, ensure_ascii=False, indent=2, default=str)
        print(f"💾 Export JSON berhasil disimpan ke: {json_path}")

if __name__ == "__main__":
    main()
