Dưới đây là bản tổng hợp đầy đủ các API, request/response cần handle, và workflow cập nhật mặt hàng.

---

# 1) Mục tiêu kỹ thuật cần chốt

Bài toán của bạn hiện có thể mô hình hóa như sau:

1. xác định tập mặt hàng cần sửa
2. lấy full dữ liệu từng mặt hàng
3. chỉnh một số field
4. gửi lại full object qua API update
5. kiểm tra response để xác nhận update thành công

Tức là pattern chuẩn sẽ là:

```text
List/Filter items
→ Get item detail
→ Modify item object in memory
→ PUT full item
→ Verify response / re-fetch detail
```

---

# 2) Các API bạn cần

## A. Lấy danh sách mặt hàng

### Endpoint

```http
GET https://fnb.mysapo.vn/admin/items.json?page=1&limit=50
```

### Query params

* `page`: số trang
* `limit`: số bản ghi mỗi trang

### Mục đích

* lấy danh sách toàn bộ mặt hàng
* lấy `client_id`, `server_id`, `name`
* xác định số lượng tổng qua `metadata.total`
* làm đầu vào cho vòng lặp cập nhật

### Response shape cần handle

```json
{
  "metadata": {
    "total": 77,
    "page": 1,
    "version": 128401405,
    "limit": 50
  },
  "items": [
    {
      "server_id": 14144705,
      "client_id": "5a81aff0-cc05-4abb-9c56-2be71952dc28",
      "name": "Nước lọc",
      "description": "",
      "item_type": "basic",
      "stock_type": "item",
      "color": "B1AFAF",
      "stamp_print": false,
      "kitchen_id": "903346b4-2320-446b-be72-80f734d1cc91",
      "sub_kitchen_ids": [],
      "created_on": 1773638930,
      "modified_on": 1773676693,
      "barcode_setting": false,
      "tax": null,
      "time_frame_id": null,
      "stock_unit": null,
      "category": null,
      "image": null,
      "variants": [],
      "mod_sets": [],
      "channels": [],
      "sale_channels": [],
      "tax_infos": {
        "vat_pit_category_code": "",
        "vat_pit_category_name": ""
      },
      "tax_reduction_rate": null
    }
  ]
}
```

### Những field bạn nên dùng từ response list

Tối thiểu:

* `metadata.total`
* `metadata.page`
* `metadata.limit`
* `items[].client_id`
* `items[].server_id`
* `items[].name`
* `items[].category`
* `items[].modified_on`

### Lưu ý

Response list thường đủ để lọc sơ bộ, nhưng để update thì vẫn nên gọi detail riêng cho từng item.

---

## B. Lấy danh sách danh mục

### Endpoint

```http
GET https://fnb.mysapo.vn/admin/categories.json?page=1&name=&limit=5
```

### Query params

* `page`
* `name`
* `limit`

### Mục đích

* map từ tên danh mục sang `category.client_id`
* dùng khi muốn lọc sản phẩm theo category
* dùng khi muốn set category theo object đúng format

### Response shape cần handle

```json
{
  "categories": [
    {
      "client_id": "5ea1fb1b-46ee-4c76-8f28-53d0076940f9",
      "name": "NƯỚC PHA CHẾ",
      "created_on": 1772695293,
      "modified_on": null,
      "products_count": 4
    }
  ],
  "metadata": {
    "total": 4,
    "page": 1,
    "version": 10174851,
    "limit": 5
  }
}
```

### Những field nên handle

* `categories[].client_id`
* `categories[].name`
* `categories[].products_count`
* `metadata.total`

---

## C. Lọc mặt hàng theo danh mục

### Endpoint

```http
GET https://fnb.mysapo.vn/admin/items.json?page=1&limit=50&category_id=5ea1fb1b-46ee-4c76-8f28-53d0076940f9
```

### Query params

* `page`
* `limit`
* `category_id`

### Mục đích

* chỉ lấy các mặt hàng thuộc một danh mục
* chia batch theo category để giảm rủi ro
* chạy cập nhật từng nhóm nhỏ

### Response shape cần handle

Giống hệt API list mặt hàng, chỉ khác tập dữ liệu trả về.

### Những field quan trọng

* `metadata.total`
* `items[].client_id`
* `items[].name`
* `items[].category.client_id`
* `items[].category.name`

---

## D. Xem chi tiết 1 mặt hàng

### Endpoint

```http
GET https://fnb.mysapo.vn/admin/items/{client_id}.json
```

Ví dụ:

```http
GET https://fnb.mysapo.vn/admin/items/5a81aff0-cc05-4abb-9c56-2be71952dc28.json
```

### Mục đích

* lấy full object chuẩn nhất để đem đi update
* tránh việc payload bị thiếu field
* làm snapshot trước khi sửa

### Response shape cần handle

```json
{
  "item": {
    "server_id": 14144705,
    "client_id": "5a81aff0-cc05-4abb-9c56-2be71952dc28",
    "name": "Nước lọc",
    "description": "",
    "item_type": "basic",
    "stock_type": "item",
    "color": "B1AFAF",
    "stamp_print": false,
    "kitchen_id": "903346b4-2320-446b-be72-80f734d1cc91",
    "sub_kitchen_ids": [],
    "created_on": 1773638930,
    "modified_on": 1773676693,
    "barcode_setting": false,
    "tax": null,
    "time_frame_id": null,
    "stock_unit": null,
    "category": null,
    "image": null,
    "variants": [
      {
        "client_id": "4db2ce5d-2f11-4333-bdda-74d6a435d756",
        "name": "Giá thường",
        "title": "Nước lọc (Giá thường)",
        "price_type": "fixed",
        "price": 15000.00,
        "cost": null,
        "order_number": 1,
        "stock": 8.0000,
        "threshold_low": 0.0000,
        "stock_management": true,
        "time_block": null,
        "time_unit": null,
        "barcode": null,
        "cost_setting": false,
        "export_price": null,
        "code": "NUOCLOC",
        "pricing_policies": []
      }
    ],
    "mod_sets": [],
    "channels": ["at_store"],
    "sale_channels": [
      {
        "channel_code": "at_store",
        "available_status": "AVAILABLE"
      }
    ],
    "tax_infos": {
      "vat_pit_category_code": "",
      "vat_pit_category_name": ""
    },
    "tax_reduction_rate": null
  }
}
```

### Đây là response quan trọng nhất cần handle

Vì object trong `item` chính là object nền để bạn sửa và `PUT` lại.

---

## E. Cập nhật 1 mặt hàng

### Endpoint

```http
PUT https://fnb.mysapo.vn/admin/items/{client_id}.json
```

Ví dụ:

```http
PUT https://fnb.mysapo.vn/admin/items/9477450a-c5c4-4227-8617-208fdb4800a9.json
```

### Mục đích

* cập nhật mặt hàng sau khi đã chỉnh object `item`

### Payload thực tế nên dùng

Theo kết quả test của bạn, payload nên là:

```json
{
  "item": {
    "server_id": 14044810,
    "client_id": "9477450a-c5c4-4227-8617-208fdb4800a9",
    "name": "MÌ TRỘN INDOMIE đặc biệt",
    "description": "",
    "item_type": "basic",
    "stock_type": "nottrack",
    "color": "B1AFAF",
    "stamp_print": true,
    "kitchen_id": "903346b4-2320-446b-be72-80f734d1cc91",
    "sub_kitchen_ids": [],
    "created_on": 1772695293,
    "modified_on": 1773460316,
    "barcode_setting": false,
    "tax": null,
    "time_frame_id": "28f1595f-44cf-4ccb-ab91-c2c3ec5f2d11",
    "stock_unit": null,
    "category": {
      "client_id": "5ea1fb1b-46ee-4c76-8f28-53d0076940f9",
      "name": "NƯỚC PHA CHẾ"
    },
    "image": null,
    "variants": [
      {
        "client_id": "1f4a75fc-18ef-488f-b490-07905a931660",
        "name": "Giá thường",
        "title": "MÌ TRỘN INDOMIE đặc biệt (Giá thường)",
        "price_type": "fixed",
        "price": 35000,
        "cost": "",
        "order_number": 1,
        "threshold_low": "",
        "stock_management": true,
        "time_block": null,
        "time_unit": null,
        "barcode": null,
        "cost_setting": false,
        "export_price": null,
        "code": "MI",
        "pricing_policies": [
          {
            "client_id": "31ee5032-a705-476b-a78b-8d2d4ab1955d",
            "code": "online",
            "price": 35000,
            "time_block": 0,
            "time_unit": null,
            "time_slot_name": null,
            "specific_time": null,
            "day_of_week": null
          },
          {
            "client_id": "ec7a2e58-60ac-4571-8cbc-021ee9317063",
            "code": "qr_order",
            "price": 35000,
            "time_block": 0,
            "time_unit": null,
            "time_slot_name": null,
            "specific_time": null,
            "day_of_week": null
          }
        ],
        "disabled": false,
        "item_ingredients": [],
        "init_stock": "0"
      }
    ],
    "mod_sets": [],
    "channels": ["at_store", "online", "qr_order"],
    "sale_channels": [
      {
        "channel_code": "at_store",
        "available_status": "AVAILABLE"
      },
      {
        "channel_code": "online",
        "available_status": "AVAILABLE"
      },
      {
        "channel_code": "qr_order",
        "available_status": "AVAILABLE"
      }
    ],
    "tax_infos": {
      "vat_pit_category_code": "305",
      "vat_pit_category_name": "Dịch vụ ăn uống;"
    },
    "tax_reduction_rate": null
  }
}
```

### Kết luận về payload update

Bạn nên coi như backend yêu cầu:

* `body = JSON.stringify({ item: fullItemObject })`

chứ không nên giả định partial update.

---

## F. Response update

### Response shape cần handle

```json
{
  "item": {
    "server_id": 14044810,
    "client_id": "9477450a-c5c4-4227-8617-208fdb4800a9",
    "name": "MÌ TRỘN INDOMIE đặc biệt",
    "description": "",
    "item_type": "basic",
    "stock_type": "nottrack",
    "color": "B1AFAF",
    "stamp_print": true,
    "kitchen_id": "903346b4-2320-446b-be72-80f734d1cc91",
    "sub_kitchen_ids": [],
    "created_on": 1772695293,
    "modified_on": 1773718119,
    "barcode_setting": false,
    "tax": null,
    "time_frame_id": "28f1595f-44cf-4ccb-ab91-c2c3ec5f2d11",
    "stock_unit": null,
    "category": {
      "client_id": "5ea1fb1b-46ee-4c76-8f28-53d0076940f9",
      "name": "NƯỚC PHA CHẾ"
    },
    "image": null,
    "variants": [
      {
        "client_id": "1f4a75fc-18ef-488f-b490-07905a931660",
        "name": "Giá thường",
        "title": "MÌ TRỘN INDOMIE đặc biệt (Giá thường)",
        "price_type": "fixed",
        "price": 35000.00,
        "cost": null,
        "order_number": 1,
        "stock": 0,
        "threshold_low": null,
        "stock_management": false,
        "time_block": null,
        "time_unit": null,
        "barcode": null,
        "cost_setting": false,
        "export_price": null,
        "code": "MI",
        "pricing_policies": [
          {
            "client_id": "31ee5032-a705-476b-a78b-8d2d4ab1955d",
            "code": "online",
            "price": 35000.00,
            "time_block": 0,
            "time_unit": null,
            "time_slot_name": null,
            "specific_time": null,
            "day_of_week": null
          },
          {
            "client_id": "ec7a2e58-60ac-4571-8cbc-021ee9317063",
            "code": "qr_order",
            "price": 35000.00,
            "time_block": 0,
            "time_unit": null,
            "time_slot_name": null,
            "specific_time": null,
            "day_of_week": null
          }
        ]
      }
    ],
    "mod_sets": [],
    "channels": ["at_store", "online", "qr_order"],
    "sale_channels": [
      {
        "channel_code": "at_store",
        "available_status": "AVAILABLE"
      },
      {
        "channel_code": "online",
        "available_status": "AVAILABLE"
      },
      {
        "channel_code": "qr_order",
        "available_status": "AVAILABLE"
      }
    ],
    "tax_infos": {
      "vat_pit_category_code": "305",
      "vat_pit_category_name": "Dịch vụ ăn uống;"
    },
    "tax_reduction_rate": null
  }
}
```

### Những gì cần kiểm tra sau update

* response có `item` hay không
* `item.modified_on` có đổi không
* field mục tiêu đã đổi đúng chưa
* các field khác có bị backend normalize hay không

---

# 3) Header / request options bạn cần handle

## Method

* list categories: `GET`
* list items: `GET`
* get item detail: `GET`
* update item: `PUT`

## Headers tối thiểu nên gửi

```http
Content-Type: application/json
Accept: application/json, text/plain, */*
X-Requested-With: XMLHttpRequest
X-CSRF-Token: <nếu có>
```

## Credentials

Khi gọi bằng browser script nên dùng:

```js
credentials: "include"
```

Để gửi cookie session hiện tại.

## CSRF

Nhiều khả năng lấy từ:

```js
document.querySelector('meta[name="csrf-token"]')?.content
```

---

# 4) Những phần dữ liệu trong item bạn phải đặc biệt cẩn thận

Vì bạn phải PUT full item, các field sau không nên bỏ sót hoặc tự tái tạo sai.

# 5) Điều nên giả định về backend

Từ những gì bạn test được, nên làm việc với giả định sau:

## Giả định 1

`PUT /admin/items/{client_id}.json` hoạt động kiểu **replace/validate full object**, không phải partial merge.

## Giả định 2

Một số field khi gửi lên có thể được backend normalize lại, ví dụ:

* `""` thành `null`
* `stock_management` đổi theo rule nội bộ
* các field phụ trong variant có thể bị bỏ qua hoặc tự tính lại

## Giả định 3

Payload update nên được lấy từ `GET detail`, sửa tại chỗ, rồi gửi lại.

---

# 6) Workflow cập nhật mặt hàng

Đây là workflow nên dùng nếu muốn an toàn và ổn định.

## Workflow tổng quát

### Bước 1: xác định tập item cần sửa

Có 3 cách phổ biến:

* toàn bộ item:

  ```http
  GET /admin/items.json?page=1&limit=50
  ```

* theo category:

  ```http
  GET /admin/categories.json
  GET /admin/items.json?page=1&limit=50&category_id=...
  ```

* theo filter custom trong code:

  * tên sản phẩm
  * mã variant
  * category name
  * `tax_infos` đang rỗng
  * `time_frame_id` đang null

---

### Bước 2: lấy full detail từng item

```http
GET /admin/items/{client_id}.json
```

Mục đích:

* lấy object chuẩn
* snapshot trước khi sửa
* không bị thiếu field

---

### Bước 3: sửa dữ liệu trong memory

Ví dụ:

* set `item.tax_infos`
* set `item.description`
* set `item.time_frame_id`
* set `item.stamp_print`
* set `item.variants[0].price`
* set `item.variants[i].pricing_policies[j].price`

Chỉ sửa field mục tiêu, còn lại giữ nguyên.

---

### Bước 4: PUT full object

```http
PUT /admin/items/{client_id}.json
Body: { "item": fullItemObjectAfterPatch }
```

---

### Bước 5: kiểm tra response

Xác minh:

* request success
* `response.item.modified_on` mới hơn
* field target đúng như mong muốn

---

### Bước 6: nếu cần thì GET lại để verify

```http
GET /admin/items/{client_id}.json
```

Dùng khi:

* update quan trọng
* muốn chắc backend không normalize sai
* chạy batch lớn

---

# 7) Workflow batch đề xuất

Nếu bạn định cập nhật nhiều mặt hàng, quy trình tốt nhất là:

## Phase 1: chuẩn bị

1. gọi categories nếu cần lọc theo danh mục
2. gọi items list để lấy danh sách
3. build danh sách target items

## Phase 2: cập nhật

Lặp từng item:

1. `GET detail`
2. clone `detail.item`
3. patch field
4. `PUT full item`
5. log kết quả

## Phase 3: hậu kiểm

* kiểm tra tổng số success/fail
* nếu cần thì `GET detail` lại các item vừa update

---

# 8) Những loại lỗi bạn nên handle

## HTTP errors

* `400 Bad Request`
* `401 Unauthorized`
* `403 Forbidden`
* `404 Not Found`
* `422 Unprocessable Entity`
* `500 Internal Server Error`

## Validation / business rule errors

Dù hiện bạn chưa đưa response lỗi mẫu, code nên chuẩn bị để handle:

* thiếu field bắt buộc
* giá trị không hợp lệ
* category object sai format
* variant object thiếu `client_id`
* pricing policy sai cấu trúc

## Parse errors

* response không phải JSON
* body rỗng
* HTML error page

## Data normalization

Backend có thể trả về object khác nhẹ so với payload:

* `"" -> null`
* số nguyên -> số thực
* tự tắt/mở `stock_management`
* loại bỏ field phụ

---

# 9) Cấu trúc xử lý trong code nên như nào

Về mặt logic, bạn chỉ cần tách thành các hàm sau:

## Nhóm fetch

* `getCategories(page, limit, name?)`
* `getItems(page, limit, categoryId?)`
* `getAllItems(...)`
* `getItemDetail(clientId)`

## Nhóm transform

* `patchItem(item, rules)`
* `validatePatchedItem(item)`

## Nhóm update

* `updateItem(clientId, item)`

## Nhóm verify/log

* `compareBeforeAfter(before, after)`
* `verifyResponse(response, expectedFields)`
* `logResult(...)`

---

# 10) Quy tắc sửa dữ liệu nên áp dụng

## Rule 1

Không dựng object item từ đầu.

Luôn:

```text
GET detail → clone detail.item → sửa đúng field → PUT lại
```

## Rule 2

Không assume `null` và `""` giống nhau.

Ví dụ:

* `tax_infos` có thể là object với string rỗng
* `cost` có thể là `""` lúc gửi, nhưng response thành `null`
* `threshold_low` có thể tương tự

## Rule 3

Không assume chỉ có 1 variant.

Dù hiện nhiều item chỉ có 1 variant, code vẫn nên loop theo `variants[]`.

## Rule 4

Nếu sửa giá, phải xác định rõ có đồng bộ `pricing_policies` hay không.

Ví dụ:

* `variants[0].price = 35000`
* có thể cũng phải update:

  * `pricing_policies[code=online].price`
  * `pricing_policies[code=qr_order].price`

## Rule 5

Khi sửa category, giữ đúng format object:

```json
"category": {
  "client_id": "...",
  "name": "..."
}
```

Không nên chỉ set string name.

---
