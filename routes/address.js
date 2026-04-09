const router = require('express').Router();
const { getAllProvince } = require('new-vn-provinces/provinces');
const { getWardsByProvinceId } = require('new-vn-provinces/wards');

// API: Lấy danh sách tất cả tỉnh/thành phố
router.get('/provinces', async (req, res) => {
    try {
        const provinces = await getAllProvince();
        res.json(provinces);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi khi lấy danh sách tỉnh/thành phố' });
    }
});

// API: Lấy danh sách quận/huyện của một tỉnh (dùng endpoint mặc định của thư viện)
router.get('/districts/:provinceId', async (req, res) => {
    try {
        // Lưu ý: Thư viện cung cấp getWardsByProvinceId để lấy phường/xã.
        // Để lấy quận/huyện, bạn cần truy vấn từ danh sách quận/huyện có sẵn.
        // Có thể sử dụng một phương pháp khác như lưu dữ liệu JSON hoặc dùng thư viện khác.
        // Dưới đây là cách lấy wards (phường/xã) - có thể tạm dùng để minh họa.
        const wards = await getWardsByProvinceId(req.params.provinceId);
        // Lọc ra các quận/huyện duy nhất từ danh sách phường/xã (không phải giải pháp tối ưu)
        const districts = [...new Map(wards.map(ward => [ward.idDistrict, { id: ward.idDistrict, name: ward.districtName }])).values()];
        res.json(districts);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi khi lấy danh sách quận/huyện' });
    }
});

// API: Lấy danh sách phường/xã của một quận/huyện
router.get('/wards/:districtId', async (req, res) => {
    try {
        // Thư viện new-vn-provinces không có hàm lấy wards theo districtId trực tiếp.
        // Bạn có thể dùng getAllWards() và lọc theo idDistrict, hoặc dùng thư viện khác.
        // Dưới đây là cách dùng getAllWards() và lọc (kém hiệu quả, chỉ nên dùng nếu dữ liệu nhỏ).
        const { getAllWards } = require('new-vn-provinces/wards');
        const allWards = await getAllWards();
        const wards = allWards.filter(ward => ward.idDistrict === req.params.districtId);
        res.json(wards);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi khi lấy danh sách phường/xã' });
    }
});

module.exports = router;