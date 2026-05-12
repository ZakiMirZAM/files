import pdfplumber
import os
 
folder = r"C:\Users\Zaki_Mir\Documents\books\books"
 
pdf_files = [f for f in os.listdir(folder) if f.lower().endswith(".pdf")]
 
if not pdf_files:
    print("No PDF files found in the folder.")
else:
    for filename in pdf_files:
        pdf_path = os.path.join(folder, filename)
        txt_filename = os.path.splitext(filename)[0] + ".txt"
        txt_path = os.path.join(folder, txt_filename)
 
        print(f"Processing: {filename}")
 
        try:
            with pdfplumber.open(pdf_path) as pdf:
                with open(txt_path, "w", encoding="utf-8") as txt_file:
                    for i, page in enumerate(pdf.pages):
                        text = page.extract_text()
                        if text:
                            txt_file.write(text)
                            txt_file.write("\n")
            print(f"  Saved: {txt_filename}")
        except Exception as e:
            print(f"  Error processing {filename}: {e}")
 
    print("\nDone.")