# Tài liệu tích hợp tab tạo `modify_set` / mapping item cho SAPO FNB

## 1. Mục tiêu

Tab mới này dùng để:

1. Tạo **nhiều modify set** trong một phiên thao tác
2. Mỗi modify set có **nhiều options**
3. Cho phép **paste dữ liệu từ Excel** vào bảng nhập liệu
4. Validate dữ liệu qua bước **preview**
5. Sau khi tạo modify set thành công thì mới **mapping vào items**
6. Phần tìm kiếm / chọn items sẽ **tái sử dụng chức năng search item có sẵn** của tool hiện tại

---

# 2. API cần dùng

## 2.1. API tạo modify set

### Endpoint

```http
POST /admin/modify_sets.json
```

### Mục đích

Tạo một modify set cùng toàn bộ options bên trong.

### Request payload

```json
{
  "modify_set": {
    "allow_multiple_quantity": true,
    "client_id": "33e31133-9889-4c26-836b-87ba86906ed7",
    "max_quantity": 1,
    "min_quantity": 1,
    "mod_options": [
      {
        "client_id": "1dff9564-3c7e-4784-8612-087b5329f7ae",
        "default_selected": false,
        "mod_ingredients": [],
        "name": "S",
        "order_number": 1,
        "price": 0,
        "cost": ""
      },
      {
        "client_id": "e1c18990-e174-4267-96ec-00bd4d91634d",
        "default_selected": true,
        "mod_ingredients": [],
        "name": "M",
        "order_number": 2,
        "price": 10000,
        "cost": ""
      }
    ],
    "name": "Size",
    "stock_type": "nottrack"
  }
}
```

---

## 2.2. API mapping modify set vào items

### Endpoint

```http
/admin/items/modify_set_mapping.json?modSetId=<MOD_SET_ID>&itemIds=<ITEM_ID_1>,<ITEM_ID_2>,...
```

### Mục đích

Gắn một modify set đã tạo vào một hoặc nhiều item.

### Request payload / query

```text
modSetId=33e31133-9889-4c26-836b-87ba86906ed7
itemIds=1a30b99a-e5ee-4899-8f5f-cdd4c29ea45b,14fd1aa2-049e-46a9-9bc4-35cdc4b2bc67
```

Lưu ý: hiện theo dữ liệu bạn có, `modSetId` và `itemIds` đang đi qua query string. Khi implement thực tế chỉ cần bám đúng request mà site đang gửi.

---

## 2.3. API tìm kiếm items

Phần này **không định nghĩa lại mới** trong tài liệu vì bạn sẽ tái sử dụng chức năng search item có sẵn của tool hiện tại (Search items thành 1 bảng, có filter theo danh mục).

### Mục đích sử dụng trong tab này

* tìm item theo tên / keyword
* lấy `client_id`
* cho phép chọn nhiều item để mapping

### Điều kiện tối thiểu từ API search item hiện có

Response cần cho tab này ít nhất các trường:

* `client_id` của item
* `name` của item

---

# 3. Dữ liệu đầu vào cần chuẩn hóa

## 3.1. Modify set

Mỗi modify set cần các field sau:

* `client_id`
* `name`
* `min_quantity`
* `max_quantity`
* `allow_multiple_quantity`
* `stock_type`
* `mod_options`

### Ghi chú

* `client_id` sẽ do FE tự generate
* `stock_type` hiện đang dùng giá trị `nottrack` (Handle ở version sau)

---

## 3.2. Option trong modify set

Mỗi option cần các field sau:

* `client_id`
* `name`
* `price`
* `cost`
* `default_selected`
* `order_number`
* `mod_ingredients`

### Ghi chú

* `client_id` do FE tự generate
* `mod_ingredients` hiện để `[]`
* `order_number` FE tự đánh theo thứ tự dòng hợp lệ sau khi clean data
* `default_selected` là cột phụ trong UI, không tham gia tab/enter sheet-flow
* `cost` là cột giá vốn, sẽ có trong sheet

---

# 4. ID và tham số lấy ở đâu

## 4.1. `modify_set.client_id`

### Nguồn

FE tự generate

### Cách dùng

* dùng khi gửi request tạo modify set
* dùng lại làm `modSetId` cho API mapping

---

## 4.2. `mod_options[].client_id`

### Nguồn

FE tự generate cho từng option

### Cách dùng

* gửi trong request create modify set

---

## 4.3. `itemIds`

### Nguồn

Lấy từ chức năng search items có sẵn của tool

### Cách dùng

* danh sách item được user chọn trong tab này
* khi mapping sẽ join bằng dấu phẩy

---

# 5. Request cần handle

## 5.1. Request tạo modify set

### FE cần build payload theo format chuẩn

```json
{
  "modify_set": {
    "allow_multiple_quantity": true,
    "client_id": "<generated_uuid>",
    "max_quantity": 1,
    "min_quantity": 0,
    "mod_options": [
      {
        "client_id": "<generated_uuid>",
        "default_selected": false,
        "mod_ingredients": [],
        "name": "Trân châu",
        "order_number": 1,
        "price": 5000,
        "cost": 3000
      }
    ],
    "name": "Topping",
    "stock_type": "nottrack"
  }
}
```

### FE cần handle trước khi gửi

* bỏ dòng trống
* bỏ option không có `name`
* chuẩn hóa `price`, `cost` về number hoặc giá trị rỗng hợp lệ
* tự đánh lại `order_number`
* validate chỉ có tối đa số option `default_selected` phù hợp với rule của set nếu cần

---

## 5.2. Request mapping

### FE cần build query

```text
modSetId=<modify_set.client_id>
itemIds=<comma_separated_item_ids>
```

### FE cần handle trước khi gửi

* chỉ gửi sau khi create modify set thành công
* không gửi nếu không có item nào được chọn
* không gửi nếu `modSetId` không tồn tại
* nếu tạo nhiều modify set thì mapping từng set sau khi set đó create thành công, hoặc gom vào queue tuần tự

---

# 6. Response cần handle

## 6.1. Response từ API tạo modify set

### Dạng đã quan sát được

```json
{
  "modify_set": {
    "client_id": "33e31133-9889-4c26-836b-87ba86906ed7",
    "max_quantity": 1,
    "min_quantity": 1,
    "name": "Size",
    "stock_type": "nottrack",
    "allow_multiple_quantity": true,
    "count_items": 0,
    "mod_options": [
      {
        "client_id": "1dff9564-3c7e-4784-8612-087b5329f7ae",
        "name": "S",
        "price": 0.0,
        "cost": null,
        "default_selected": false,
        "order_number": 1,
        "cost_setting": false,
        "modifiers_pricing_policies": []
      }
    ]
  }
}
```

### Ý nghĩa FE cần hiểu

* server không trả thêm `id` riêng → `client_id` là identifier chính cần tiếp tục dùng
* có thể dùng response này để confirm:

  * set đã tạo thành công
  * tên set
  * số option thực tế server nhận
  * giá trị `cost`, `price` sau normalize

### FE nên handle

* trạng thái thành công / thất bại của từng set
* lưu lại `client_id` của set vừa tạo để mapping
* show lỗi gắn với đúng set nếu create fail

---

## 6.2. Response từ API mapping

Hiện chưa có mẫu response chi tiết trong tài liệu của bạn, nên FE nên handle theo nguyên tắc phòng thủ:

### FE cần xử lý

* nếu HTTP success → đánh dấu set đã mapping thành công
* nếu lỗi → show lỗi ở cấp set hoặc batch mapping
* giữ lại danh sách item đã chọn để user retry mà không phải chọn lại

### FE nên lưu

* `modSetId`
* danh sách `itemIds` đã mapping
* trạng thái: `pending | success | failed`

---

# 7. Validation cần handle

## 7.1. Validate set

* `name` không được rỗng
* `min_quantity` không lớn hơn `max_quantity`
* phải có ít nhất 1 option hợp lệ

## 7.2. Validate option

* `name` không được rỗng
* `price` phải parse được thành số hoặc để trống theo rule bạn chọn
* `cost` phải parse được thành số hoặc để trống theo rule bạn chọn
* `default_selected` là boolean

## 7.3. Validate mapping

* phải có ít nhất 1 item được chọn trước khi bấm apply
* chỉ mapping những set create thành công

---

# 8. UI / UX đề xuất

## 8.1. Vị trí tích hợp

Tạo tab mới nằm trong tool hiện có, tách tool hiện tại thành 1 tab của tool mới, ví dụ:

* tab hiện tại: batch tax info
* tab mới: `Modify Set`

---

## 8.2. Layout tổng quát

### Khu vực trên

Thông tin chung hoặc action:

* nút `Add set`
* `Collapse all`
* `Expand all`
* `Preview import`
* `Create & map`

### Khu vực giữa

Danh sách nhiều modify set theo dạng **card có thể collapse**

Mỗi set là một card riêng:

* tên set
* min / max
* allow multiple
* bảng options dạng sheet
* trạng thái create / mapping

### Khu vực dưới hoặc panel bên phải

Phần chọn items, tái sử dụng search item có sẵn:
Tạo thành 1 popup mới nổi lên trên, chọn và add vào danh sách các set đã tạo sau khi ấn chọn mặt hàng liên kết

* ô search
* danh sách kết quả
* selected items
* count item đã chọn

---

## 8.3. UI cho mỗi set

Mỗi set card gồm:

### Header

* tên set
* số options hợp lệ
* trạng thái:

  * draft
  * validated
  * created
  * mapped dạng bảng có thể scroll và có nút "X" ở mỗi dòng để delete
  * failed
* nút collapse/expand
* nút delete set
* nút duplicate set nếu muốn hỗ trợ sau này

### Body

* input `name`
* input `min_quantity`
* input `max_quantity`
* checkbox `allow_multiple_quantity`
* bảng options kiểu sheet

---

## 8.4. Bảng options kiểu sheet

### Cột chính trong sheet

* `name`
* `price`
* `cost`

### Cột phụ ngoài flow sheet

* `default`

Ý nghĩa:

* `Tab` và `Enter` chỉ flow qua 3 cột chính
* cột `default` tồn tại để tick chọn nhưng không tính vào luồng spreadsheet navigation

### Hành vi bàn phím

* `Tab`: sang ô kế tiếp trong 3 cột chính
* hết cột cuối thì sang dòng kế
* `Enter`: xuống dòng dưới cùng cột
* số dòng không giới hạn
* cuối bảng tự sinh dòng mới khi cần
* cho phép bôi đen để xóa nhiều dòng cùng lúc
* cho phép kéo fill dữ liệu xuống

### Hành vi paste

User có thể paste trực tiếp từ Excel, ví dụ:

```text
GÀ VIÊN GIÒN		55000.00
GÀ VIÊN SỐT ( 1 LOẠI )			70000.00
```

### Logic parse

* split theo dòng
* split theo tab
* `name` lấy từ cột đầu tiên có dữ liệu hợp lý
* `price` và `cost` map theo format bạn định nghĩa cho sheet
* bỏ các cột trống không cần thiết
* không auto submit ngay sau paste

---

## 8.5. Preview import để validate

Đây là bước rất nên có vì paste Excel dễ lệch cột.

### Đề xuất flow

Sau khi paste:

1. parse dữ liệu thô
2. mở panel / modal preview
3. hiển thị:

   * số dòng nhận được
   * số dòng hợp lệ
   * số dòng lỗi
4. cho user xác nhận import vào sheet

### Preview nên hiển thị

* `name`
* `price`
* `cost`
* trạng thái hợp lệ / lỗi
* lỗi parse nếu có

### Ví dụ lỗi cần báo

* thiếu `name`
* `price` không parse được
* `cost` không parse được

---

## 8.6. Chọn items để mapping

Phần này dùng search item có sẵn, nhưng UX nên hỗ trợ:

* search theo tên
* chọn nhiều item
* selected items hiển thị rõ count
* có thể remove từng item khỏi selection
* selection được giữ nguyên khi user chuyển qua lại giữa các set

### Gợi ý

Vì mapping là áp dụng cho toàn bộ các set đã tạo trong batch, phần chọn items nên ở mức **toàn tab**, không nằm riêng trong từng set card.

---

## 8.7. Feedback trạng thái

Mỗi set cần có trạng thái riêng:

* chưa validate
* validate ok
* đang tạo
* tạo thành công
* tạo lỗi
* đang mapping
* mapping thành công
* mapping lỗi

Điều này rất quan trọng nếu user tạo nhiều set cùng lúc.

---

# 9. Workflow chuẩn

Đây là flow nghiệp vụ chính, cần giữ đúng thứ tự:

## Bước 1. User nhập dữ liệu set

* thêm 1 hoặc nhiều set
* nhập thông tin set
* nhập options bằng sheet
* có thể paste từ Excel
* có thể collapse set để tiếp tục thêm set khác

## Bước 2. Preview và validate

* parse dữ liệu sheet
* preview dữ liệu paste/import
* highlight lỗi
* chỉ giữ lại các row hợp lệ hoặc buộc user sửa trước khi tiếp tục, tùy rule bạn chọn

## Bước 3. User chọn items

* dùng search item có sẵn trong tool
* lấy `itemIds`
* build selected item list

## Bước 4. Gửi API tạo set

**Phải gửi create set trước**

* lặp qua từng set hợp lệ
* generate `client_id` cho set
* generate `client_id` cho từng option
* build payload
* gọi `POST /admin/modify_sets.json`

## Bước 5. Handle response tạo set

* nếu thành công:

  * lấy `modify_set.client_id` từ response hoặc dùng lại client_id FE vừa gửi
  * đánh dấu set = created
* nếu thất bại:

  * đánh dấu fail
  * không mapping set đó

## Bước 6. Gửi API mapping

**Chỉ sau khi set đã tạo thành công**

* lấy `modSetId` = `modify_set.client_id`
* lấy `itemIds` từ selection
* gọi API mapping cho từng set thành công

## Bước 7. Handle response mapping

* set nào mapping thành công → mark mapped
* set nào mapping fail → mark failed, cho phép retry

---

# 10. Trình tự xử lý đề xuất trong code

## Pha 1: model nội bộ UI

Mỗi set nên có state dạng:

```js
{
  localId: "...",
  name: "Topping",
  minQuantity: 0,
  maxQuantity: 3,
  allowMultipleQuantity: true,
  rows: [
    { name: "Trân châu", price: 5000, cost: 3000, default: false }
  ],
  status: "draft",
  apiClientId: null,
  createError: null,
  mappingError: null
}
```

## Pha 2: normalize trước khi submit

Từ rows trong UI → build `mod_options` hợp lệ:

* filter row rỗng
* parse number
* đánh `order_number`
* generate UUID

## Pha 3: submit tuần tự

Với mỗi set:

1. create
2. nếu create ok thì mapping
3. cập nhật status

Cách này dễ debug hơn batch song song.

---

# 11. Những điểm chốt để implement

## Chắc chắn

* create set trước, mapping sau
* `client_id` do FE generate
* `itemIds` lấy từ search item có sẵn
* bảng sheet có 3 cột chính: `name`, `price`, `cost`
* cột `default` là cột phụ, không tham gia flow Tab / Enter
* cần preview paste Excel để validate trước khi đổ vào data thật

## Nên làm

* trạng thái riêng cho từng set
* giữ selection item xuyên suốt tab
* collapse/expand từng set card
* parse paste theo hướng tolerant với cột trống

---

# 12. Kết luận

Tab này nên được thiết kế như một **batch modify set creator + mapper** với 3 phần rõ ràng:

1. **Editor nhiều set**

   * card có collapse
   * sheet 3 cột `name / price / cost`
   * cột phụ `default`

2. **Preview / validate paste Excel**

   * parse trước
   * cho user confirm

3. **Mapping item**

   * tái sử dụng search item có sẵn
   * chỉ mapping sau khi create set thành công

Và workflow chuẩn cần giữ là:

```text
Nhập set -> Validate/Preview -> Chọn items -> Create modify_set -> Mapping items
```
