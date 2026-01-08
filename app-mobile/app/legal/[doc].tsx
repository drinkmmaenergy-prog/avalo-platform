import { getLegalDoc, type LegalTopic } from '@/shared/legal/legalRegistry'
import { useLocalSearchParams } from 'expo-router'
import { useTranslation } from '@/hooks/useTranslation'
import { ScrollView, Text } from 'react-native'

export default function LegalDocScreen() {
  const { doc } = useLocalSearchParams()
  const { locale } = useTranslation()
  const topic = doc as LegalTopic
  const content = getLegalDoc(topic, locale)
  return <ScrollView style={{ padding: 16 }}><Text>{content}</Text></ScrollView>
}
