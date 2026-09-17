with open('frontend/src/pages/ChangeRequests.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Remove upload_new_version block
upload_block = '''                              {isSohaviyOrAdmin && item.status !== "COMPLETED" && item.status !== "REJECTED" && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5, color: "#0284c7", fontWeight: 600 }}
                                  onClick={() => {
                                    setActiveActionMenuId(null);
                                    handleOpenUploadVersion(item);
                                  }}
                                >
                                  {tx("orders.upload_new_version")}
                                </button>
                              )}'''
text = text.replace(upload_block, '')

# 2. Replace word_korish and word_yuklash with Tarix
word_block = '''                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5 }}
                                onClick={() => {
                                  setActiveActionMenuId(null);
                                  handlePreviewDocx(item.id, item.request_no);
                                }}
                              >
                                {tx("orders.word_korish")}
                              </button>

                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5 }}
                                onClick={() => {
                                  setActiveActionMenuId(null);
                                  handleDownloadDocx(item.id, item.request_no);
                                }}
                              >
                                {tx("orders.word_yuklash")}
                              </button>'''

tarix_block = '''                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ width: "100%", justifyContent: "flex-start", fontSize: 12.5 }}
                                onClick={() => {
                                  setActiveActionMenuId(null);
                                  handleOpenView(item);
                                }}
                              >
                                ?? {tx("orders.tarix", undefined, "Tarix (Word fayllar)")}
                              </button>'''

text = text.replace(word_block, tarix_block)

with open('frontend/src/pages/ChangeRequests.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
