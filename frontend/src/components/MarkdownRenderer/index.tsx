import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

export default function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || '')
          const isInline = !className
          if (isInline) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            )
          }
          return (
            <SyntaxHighlighter
              style={oneDark as any}
              language={match ? match[1] : 'text'}
              PreTag="pre"
            >
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
