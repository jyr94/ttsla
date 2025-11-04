import json
import requests

# URL sumber data kata KBBI (tanpa definisi)
URL = "https://raw.githubusercontent.com/damzaky/kumpulan-kata-bahasa-indonesia-KBBI/master/legacy/indonesian-words.txt"

def fetch_kbbi_words():
    print("📥 Mengunduh data kata dari GitHub...")
    res = requests.get(URL)
    if res.status_code != 200:
        raise Exception(f"Gagal mengunduh data ({res.status_code})")

    words = [
        w.strip().lower()
        for w in res.text.splitlines()
        if w.strip().isalpha()  # hanya huruf
    ]
    print(f"✅ Total kata terambil: {len(words):,}")
    return words


def build_kbbi_json(words):
    data = {"KBBI": []}
    for w in words:
        n = len(w)
        if n >= 4 and n <= 6:
            data["KBBI"].append(w)
    print(
        f"📊 Jumlah kata:\n"
        f"  Total: {len(data['KBBI']):,}"
    )
    return data


def save_to_json(data, filename="kbbiWords.json"):
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"💾 File berhasil disimpan: {filename}")


if __name__ == "__main__":
    words = fetch_kbbi_words()
    data = build_kbbi_json(words)
    save_to_json(data)
    print("🎉 Selesai membangun kbbiWords.json!")
