const express = require('express')
const router = express.Router()
const { isAdmin } = require('./middlewares')
const { Item, Img } = require('../models')
const fs = require('fs')
const { Op } = require('sequelize')
const path = require('path')
const multer = require('multer')

// uploads 폴더가 없을 경우 새로 생성
try {
  fs.readdirSync('uploads') //해당 폴더가 있는지 확인
} catch (error) {
  console.log('uploads 폴더가 없어 uploads 폴더를 생성합니다.')
  fs.mkdirSync('uploads') //폴더 생성
}

// 이미지 업로드를 위한 multer 설정
const upload = multer({
  // 저장할 위치와 파일명 지정
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, 'uploads/') // uploads폴더에 저장
    },
    filename(req, file, cb) {
      const decodedFileName = decodeURIComponent(file.originalname) //파일명 디코딩(한글 파일명 깨짐 방지) => 제주도.jpg
      const ext = path.extname(decodedFileName) //확장자 추출
      const basename = path.basename(decodedFileName, ext) //확장자 제거한 파일명 추출

      // 파일명 설정: 기존이름 + 업로드 날짜시간 + 확장자
      // dog.jpg
      // ex) dog + 1231342432443 + .jpg
      cb(null, basename + Date.now() + ext)
    },
  }),
  // 파일의 크기 제한
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB로 제한
})

//상품등록 localhost:8000/item
// upload.array(매개변수)의 매개변수 값은 input 태그의 name 값 사용, 만약 formData 사용시 formData의 key값 사용
router.post('/', isAdmin, upload.array('img'), async (req, res) => {
  try {
    //업로드된 파일 확인
    if (!req.files) {
      return res
        .status(400)
        .json({ success: false, message: '파일 업로드에 실패했습니다.', error })
    }

    //상품 insert
    const { itemNm, price, stockNumber, itemDetail, itemSellStatus } = req.body
    const item = await Item.create({
      itemNm,
      price,
      stockNumber,
      itemDetail,
      itemSellStatus,
    })
    const images = req.files.map((file) => ({
      oriImgName: file.originalname, //원본 이미지명
      imgUrl: `/${file.filename}`, //이미지 경로
      repImgYn: 'N', //기본적으로 'N'설정
      itemId: item.id, //생성된 상품 ID 연결
    }))

    if (images.length > 0) {
      images[0].repImgYn = 'Y'
    }

    // 이미지 여러개 insert
    await Img.bulkCreate(images)

    res.status(201).json({
      success: true,
      message: '상품과 이미지가 성공적으로 등록되었습니다.',
      item,
      images,
    })
  } catch (error) {
    console.error(error)
  }
})

//전체상품 불러오기(페이징, 검색 기능)
//localhost:8000/item?page=1&limit=3&sellCategory=SELL&searchTerm=가방&searchCategory=itemNm => 판매중인 상품들에서 상품명 '가방' 으로 검색
//localhost:8000/item?page=1&limit=3&sellCategory=SOLD_OUT&searchTerm=가방&searchCategory=itemDetail => 품절된 상품들에서 상품설명 '가방' 으로 검색
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1
    const limit = parseInt(req.query.limit, 10) || 5
    const offset = (page - 1) * limit
    //판매상태, 상품명, 상품설명으로 검색
    const searchTerm = req.query.searchTerm || '' //사용자가 입력한 검색어
    const searchCategory = req.query.searchCategory || 'itemNm' //상품명 or 상품설명으로 검색
    const sellCategory = req.query.sellCategory // 판매상태('SELL' 또는 'SOLD_OUT' 만 존재)

    /*
      스프레드 연산자(...)를 사용하는 이유는 조건적으로 객체를 추가하기 위해서 
      스프레드 연산자는 "",false,0,null, undefined 와 같은 falsy값들은 무시하고 값이 true일때는 반환된 객체를 추가
    */

    const whereClause = {
      //searchTerm 이 존재하면 해당 검색어(searchTerm)가 포함된 검색범주(searchCategory)를 조건으로 추가
      ...(searchTerm && {
        [searchCategory]: {
          [Op.like]: `%${searchTerm}%`,
        },
      }),
      ...(sellCategory && {
        itemSellStatus: sellCategory,
      }),
    }

    //localhost:8000/item?page=1&limit=3&sellCategory=SOLD_OUT&searchTerm=가방&searchCategory=itemDetail => 품절된 상품들에서 상품설명 '가방' 으로 검색
    /*
      whereClause = {
        itemDetail: {
          [Op.like]: '가방'
        },
        itemSellStatus: 'SELL',
      }
    */

    const count = await Item.findAll({
      where: whereClause,
    })

    const items = await Item.findAll({
      where: whereClause,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: Img,
          attributes: ['id', 'oriImgName', 'imgUrl', 'repImgYn'],
        },
      ],
    })

    res.json({
      success: true,
      message: '상품 목록 조회 성공',
      items,
      pagination: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        limit,
      },
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({
      success: false,
      message: '상품 목록 조회중 오류가 발생했습니다',
      error,
    })
  }
})

//상품 삭제 localhost:8000/item/:id
router.delete(':id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params //상품 id

    //상품이 존재하는지 확인
    const item = await Item.findByPk(id)
    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: '상품을 찾을 수 없습니다.' })
    }

    //상품삭제(연관된 이미지도 삭제 됨.cascade때매)
    await item.destroy()

    res.json({
      success: true,
      message: '상품이 성공적으로 삭제되었습니다.',
    })
  } catch (error) {}
})

module.exports = router
