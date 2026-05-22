'use client'

import { useState } from 'react'

interface SearchBarProps {
  onSearch: (postcode: string) => void
  loading?: boolean
}

export default function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [value, setValue] = useState('')

  return (
    <form
      className="flex gap-2"
      onSubmit={e => { e.preventDefault(); if (value.trim()) onSearch(value.trim()) }}
    >
      <input
        type="text"
        placeholder="Enter postcode…"
        value={value}
        onChange={e => setValue(e.target.value)}
        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 outline-none focus:border-gray-800 transition-colors w-52"
      />
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-1.5 text-sm font-medium bg-gray-900 text-white rounded-lg disabled:opacity-40 cursor-pointer"
      >
        {loading ? '…' : 'Search'}
      </button>
    </form>
  )
}
