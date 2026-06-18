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
  - Khi thu thập đủ số thẻ Math yêu cầu (`absorbedCount == elementCount`), thẻ Base sẽ "phát nổ" và biến mất khỏi bàn chơi.

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
   - Nếu nuốt đủ số lượng (`elementCount`), thẻ Base nổ tung. Nếu chưa đủ, thẻ Base sẽ nằm đè lên vị trí đó.
4. **Base kéo vào Ô trống:** Thẻ Base có thể kéo vào một cột Tableau trống hoặc ô Foundation trống.
---

## 3. Cơ chế Shuffle (Xáo bài Tất định)

Để đảm bảo Game Client và Level Editor luôn sinh ra cùng một ván bài y hệt nhau khi dùng chung một số `Shuffle Seed`, hệ thống sử dụng thuật toán **LCG (Linear Congruential Generator)** kết hợp với **Fisher-Yates Shuffle**.

**Thông số LCG chuẩn được sử dụng:**
- Multiplier (`a`): `1103515245`
- Increment (`c`): `12345`
- Modulus (`m`): `2147483648` ($2^{31}$)

**Thuật toán mô phỏng (Mã giả / C# / JS):**
```javascript
// 1. Cài đặt RNG
let state = SEED; // Nếu không có SEED, random một số.
function nextFloat() {
    state = (1103515245 * state + 12345) % 2147483648;
    return state / 2147483647; // Trả về số từ 0.0 -> 1.0
}

// 2. Trộn mảng Fisher-Yates
for (let i = cards.length - 1; i > 0; i--) {
    let j = Math.floor(nextFloat() * (i + 1));
    // Hoán đổi vị trí i và j
    let temp = cards[i];
    cards[i] = cards[j];
    cards[j] = temp;
}
```
*Việc tuân thủ chính xác bộ thông số này dưới Client là bắt buộc để tính năng "Level Design" trên web tool có ý nghĩa.*

---

## 4. Chú giải luồng xử lý UI (BoardPreview)

- Khi thẻ bài được di chuyển đi nơi khác, lá bài úp (nếu có) nằm ngay bên dưới ở cột Tableau sẽ tự động được lật ngửa (`isRevealed: true`).
- Nếu bật Auto-Play, thuật toán sẽ tự động quét các nước đi hợp lệ theo mức độ ưu tiên (vd: ưu tiên ghép Base, sau đó mới ghép Math) và tự động thực thi. 
- Mọi di chuyển hợp lệ đều làm tăng biến `moves` lên 1 đơn vị.
