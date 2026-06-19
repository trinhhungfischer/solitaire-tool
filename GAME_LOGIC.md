# Hướng dẫn & Tổng hợp Logic Game Solitaire

Tài liệu này tổng hợp toàn bộ các bộ luật, logic vận hành và cơ chế xử lý dữ liệu của dự án Solitaire Tool. Được thiết kế để đội ngũ lập trình viên, Game Designer và QA có thể dễ dàng đối chiếu khi xây dựng Game Client hoặc kiểm tra hệ thống.

---

## 1. Cấu trúc Thẻ Bài (Card Data)

Mỗi thẻ bài trong game được chia làm 2 loại chính (`kind`):
- **Math Card (`kind: 0`)**: Là các lá bài có chứa công thức hoặc nội dung cần thu thập (VD: `1+1`).
- **Base Card (`kind: 1`)**: Là lá bài gốc/mục tiêu. Nhiệm vụ của người chơi là dùng thẻ Base để thu thập đủ số lượng thẻ Math tương ứng với nó.

### Khái niệm `Category` & `elementCount`
- **Category (Nhóm thẻ):** Một tập hợp các lá bài bao gồm **1 thẻ Base** và **N thẻ Math**. Chúng liên kết với nhau bằng chung một ID (`category.id`).
- **`elementCount`**: Đây là thông số quan trọng quy định **tổng số thẻ Math** có trong Category đó. 
  - *Ví dụ:* Nếu một nhóm có 3 thẻ Math và 1 thẻ Base, thì `elementCount` = `3`.
  - Bộ đếm (Counter) trên thẻ Base hiển thị dưới dạng: `Số thẻ Math đã thu thập / elementCount`.
  - Khi thu thập đủ số thẻ Math yêu cầu (`absorbedCount == elementCount`), thẻ Base được xem là "đã đầy" (Full Count). **Thẻ Base sẽ không tự biến mất khỏi bàn chơi ngay lập tức**. Để hoàn thành thực sự và loại bỏ nó khỏi game, bạn phải cầm thẻ Base đã đầy này kéo thả vào các ô **Foundation** ở góc trên. Foundation cũng cho phép kéo lá Base chưa đầy lên để cất tạm (sau đó vẫn có thể ném thêm Math lên đó). Mọi lá Base chỉ bốc hơi biến mất khi nó nằm trên Foundation VÀ đã đầy count.

---

## 2. Luật Chơi (Game Rules)

Game hiện tại hỗ trợ 2 bộ luật chơi: **Classic** và **Default (New)**. Bạn có thể chuyển đổi linh hoạt trên giao diện Editor.

### A. Luật Default (Luật Mới - Mặc định)
Đây là bộ luật linh hoạt, cho phép người chơi càn quét bài nhanh hơn:
1. **Math kéo vào Math:** Bạn có thể kéo thả 1 thẻ Math (hoặc 1 chồng thẻ Math) lên trên một thẻ Math khác nếu chúng **cùng Category**.
2. **Math kéo vào Ô trống (Empty Col):** Ở khu vực Tableau (Bàn chơi), thẻ Math **ĐƯỢC PHÉP** kéo vào một cột đang trống. 
3. **Base "ăn" Math (Chỉ ở Tableau):** 
   - Thẻ Math **KHÔNG ĐƯỢC** kéo thả lên thẻ Base.
   - Ngược lại, thẻ Base **ĐƯỢC PHÉP** nhấc lên và thả đè vào một cột có thẻ Math (cùng Category).
   - Khi đó, thẻ Base sẽ "nuốt trọn" (absorb) toàn bộ các thẻ Math đang ngửa của Category đó trên đỉnh cột. 
   - Khi nuốt đủ số lượng (`elementCount`), thẻ Base được xem là "Đã đầy" (Full count). Thẻ Base đầy không tự biến mất ngay mà vẫn nằm lại trên Tableau chờ được kéo lên Foundation. Nếu chưa đầy, thẻ Base nằm đè lên vị trí đó và đợi "ăn" thêm.
4. **Base kéo vào Ô trống:** Thẻ Base có thể kéo vào một cột Tableau trống.
5. **Kéo lên Foundation:** CHỈ CÓ DUY NHẤT thẻ Base mới được phép kéo lên các ô Foundation. Thẻ Math tuyệt đối không được kéo lên đây. Thẻ Base có thể kéo lên Foundation bất cứ lúc nào (dù chưa đầy hay đã đầy count).
6. **Cơ chế Super Reshuffle (Guaranteed Winnable):** Khi rơi vào trạng thái "bị kẹt" (không còn bất kỳ nước đi hợp lệ nào để lật thêm bài), hệ thống sẽ tự động kích hoạt Super Reshuffle. 
   **Giải thích thuật toán cho Dev (2 bước):**
   - **Bước 1: Trộn bài có chủ đích (Smart Shuffle)**
     - Gom toàn bộ bài đang úp ở Tableau và bài trong Stock/Waste thành một `pool`.
     - *Bơm bài (Feeder):* Quét các thẻ Base đang ngửa trên bàn. Tìm trong `pool` các thẻ Math tương ứng và nhét chúng vào đầu Draw Pile. Đảm bảo người chơi bốc bài là có nước đi ngay.
     - *Chống kẹt (Anti-Burying):* Rải ngẫu nhiên số bài còn lại vào các ô úp của Tableau. Lưu ý: Cột nào đang có thẻ Base ngửa thì **KHÔNG** rải thẻ Math cùng loại úp xuống dưới cột đó (tránh việc thẻ chìa khóa bị đè bởi chính ổ khóa).
   - **Bước 2: Test ngầm (Auto-Verify)**
     - Thuật toán sinh ra kết quả của Bước 1, nhưng chưa hiển thị ngay.
     - Cho Bot chạy thuật toán `Quick Solve` trên kết quả đó (giới hạn 3000 vòng lặp). Nếu Bot giải thắng -> Áp dụng kết quả lên UI cho người chơi. Nếu Bot bí đường -> Bỏ kết quả đó, quay lại Bước 1 trộn lại (Tối đa 5 lần thử).
---

## 3. Cơ chế Chia bài (Thứ tự cố định)

Theo yêu cầu mới nhất, game đã **bỏ hoàn toàn cơ chế xáo trộn bài ngẫu nhiên (Shuffle)**. 
Bài sẽ được chia chính xác theo đúng thứ tự (index) được lưu trong mảng `data` của Level Editor. 
Hãy tưởng tượng mảng `data` là một bộ bài đã được xếp chồng sẵn:
- Lá bài ở vị trí đầu tiên (`data[0]`) sẽ được chia vào ô đầu tiên của cột đầu tiên trong Tableau.
- Lần lượt chia dần xuống các ô trống tiếp theo trong Tableau, và sau đó là Draw Pile.

Điều này cho phép người thiết kế Level (Level Designer) có thể kiểm soát chính xác 100% vị trí của từng lá bài trên bàn chơi để tạo ra các thế bài giải đố (Puzzle) cố định thay vì ngẫu nhiên.

---

## 4. Chú giải luồng xử lý UI (BoardPreview)

- Khi thẻ bài được di chuyển đi nơi khác, lá bài úp (nếu có) nằm ngay bên dưới ở cột Tableau sẽ tự động được lật ngửa (`isRevealed: true`).
- Nếu bật Auto-Play, thuật toán sẽ tự động quét các nước đi hợp lệ theo mức độ ưu tiên (vd: ưu tiên ghép Base, sau đó mới ghép Math) và tự động thực thi. 
- Mọi di chuyển hợp lệ đều làm tăng biến `moves` lên 1 đơn vị. Trong cửa sổ Log (Nhật ký), một nước đi (`move`) có thể sinh ra nhiều sự kiện (ví dụ: vừa di chuyển bài vừa làm nổ Base), tất cả sự kiện này được nhóm chung dưới 1 số đếm `#move` để phản ánh đúng thực tế người chơi.
