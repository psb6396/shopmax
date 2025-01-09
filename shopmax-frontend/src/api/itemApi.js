import shopmaxApi from './axiosApi'

//상품 등록
export const createItem = async (itemData) => {
  try {
    const config = {
      headers: {
        'Content-Type': 'multipart/form-data', // 파일 전송시 반드시 지정
      },
    }
    const response = await shopmaxApi.post('/item', itemData, config)
    return response
  } catch (error) {
    console.error(`API Request오류:${error.message}`)
    throw error
  }
}

//전체 상품 리스트 가져오기
export const getItems = async (data) => {
  try {
    const {
      page,
      limit,
      searchTerm = '',
      searchCategory = '',
      sellCategory = '',
    } = data

    const response = await shopmaxApi.get(
      `/item?page=${page}&limit=${limit}&sellCategory=${sellCategory}&searchTerm=${searchTerm}&searchCategory=${searchCategory}`
    )
    return response
  } catch (error) {
    console.error(`API Request오류:${error.message}`)
    throw error
  }
}
